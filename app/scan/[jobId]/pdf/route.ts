import { logDiagnostic } from '../../../lib/logging'
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { ObjectId } from 'mongodb'

import { check_user_can_view_sheet, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { getScanJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { get_context } from '@/app/graphql/types'
import { schemas } from '@/app/lib/schema'

const SCANS_SPOOL_DIR = process.env.SCANS_SPOOL_DIR || '/app/scanspool';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params

    const context = await get_context({ req })
    const user = await get_authenticated_user(context)

    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({ _id: new ObjectId(jobId) })

    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verifica i permessi sul foglio
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({ _id: job.sheetId })

    if (!sheet) {
        return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    }

    try {
        check_user_can_view_sheet(user, sheet)
    } catch (error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Il file PDF può essere in una di queste subdirectory 
    // di SCANS_SPOOL_DIR:
    // processing
    // completed
    // aborted 
    // con nome {schema.name}-{jobId}.pdf
    const schema = schemas[sheet.schema]
    if (!schema) {
        return NextResponse.json({ error: 'Schema not found' }, { status: 404 })
    }

    const fileName = `${schema.name}-${jobId}.pdf`

    for (const statusDir of ['completed', 'processing', 'aborted']) {
        const filePath = join(SCANS_SPOOL_DIR, statusDir, fileName)

        if (!existsSync(filePath)) {
            continue
        }

        try {
            const file = await readFile(filePath);

            return new NextResponse(new Uint8Array(file), {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${fileName}"`
                },
            });
        } catch (error) {
            logDiagnostic('app/scan/[jobId]/pdf/route.pdf_error_reading_file', error);
            continue
        }
    }

    logDiagnostic('app/scan/[jobId]/pdf/route.pdf_pdf_file_not_found_for_job', undefined);
    return new NextResponse('Not Found', { status: 404 });
}