import { logDiagnostic } from '../../lib/logging'
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { get_context } from '@/app/graphql/types'
import { getScanJobsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { check_user_can_edit_rows, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { schemas } from '@/app/lib/schema'
import { stageSpoolFile, type StagedSpoolFile } from '@/app/lib/spool'
import { appLog } from '@/app/lib/appLog'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

if (!JWT_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not defined');
}

export async function POST(req: NextRequest) {
    const SCANS_SPOOL_DIR = process.env.SCANS_SPOOL_DIR || ''
    if (!SCANS_SPOOL_DIR) return NextResponse.json({ error: 'upload disabled' }, { status: 503 });

    const context = await get_context({ req })
    const user = await get_authenticated_user(context)

    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const sheetIdValue = formData.get('sheetId')
        if (!sheetIdValue) return NextResponse.json({ error: 'Missing sheetId' }, { status: 400 });

        if ((typeof sheetIdValue) !== 'string') {
            return NextResponse.json({ error: 'Invalid sheetId' }, { status: 400 });
        }

        const sheetId = new ObjectId(sheetIdValue as string)

        const sheetsCollection = await getSheetsCollection()
        const sheet = await sheetsCollection.findOne({_id: sheetId})

        if (!sheet) return NextResponse.json({ error: 'Missing sheet' }, { status: 400 });

        const schema = schemas[sheet.schema]

        try {
            check_user_can_edit_rows(user,sheet)
        } catch (error) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

        if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Invalid file type, only PDF allowed' }, { status: 400 })

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const now = new Date()
        const jobId = new ObjectId()
        const jobsCollection = await getScanJobsCollection()

        // The PDF is written before the job exists and published after it is
        // committed: oliscan never sees a partial file, and a failed write
        // leaves neither an orphan job nor a wrong nScanJobs counter.
        let staged: StagedSpoolFile
        try {
            staged = await stageSpoolFile(SCANS_SPOOL_DIR, `${schema.name}-${jobId}.pdf`, buffer)
        } catch (error) {
            logDiagnostic('app/api/upload/route.error_writing_file', error);
            return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
        }

        try {
            await withTransaction(async (session) => {
                await jobsCollection.insertOne({
                    _id: jobId,
                    sheetId,
                    timestamp: now,
                    messages: [{
                        status: 'uploading',
                        message: 'caricamento PDF',
                        timestamp: now}],
                    ownerId: user._id,
                }, { session })
                await sheetsCollection.updateOne(
                    { _id: sheetId },
                    { $inc: { nScanJobs: 1 } },
                    { session }
                )
            })
        } catch (error) {
            await staged.discard()
            throw error
        }

        try {
            await staged.publish()
        } catch (error) {
            logDiagnostic('app/api/upload/route.error_publishing_file', error);
            await staged.discard()
            await withTransaction(async (session) => {
                await jobsCollection.deleteOne({ _id: jobId }, { session })
                await sheetsCollection.updateOne(
                    { _id: sheetId },
                    { $inc: { nScanJobs: -1 } },
                    { session }
                )
            })
            return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
        }

        const job_id = jobId.toString()
        appLog('scan.uploaded', { jobId: job_id, sheetId: sheetId.toString(), size: buffer.length }, { userId: user._id })

        return NextResponse.json({ 
            jobId: job_id
        });
    } catch (error) {
        logDiagnostic('app/api/upload/route.operation_failed', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
