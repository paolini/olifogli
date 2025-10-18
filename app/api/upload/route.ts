import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { ObjectId } from 'mongodb'

import { get_context } from '@/app/graphql/types'
import { getScanJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { check_user_can_edit_rows, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { schemas } from '@/app/lib/schema'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

if (!JWT_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not defined');
}

async function getSCANS_SPOOL_DIR() {
    const SCANS_SPOOL_DIR = process.env.SCANS_SPOOL_DIR || '';
    if (SCANS_SPOOL_DIR) {
        if (!existsSync(SCANS_SPOOL_DIR)) {
            await mkdir(SCANS_SPOOL_DIR, { recursive: true });
        }
    }
    return SCANS_SPOOL_DIR
}

export async function POST(req: NextRequest) {
    const SCANS_SPOOL_DIR = await getSCANS_SPOOL_DIR()
    if (!SCANS_SPOOL_DIR) return NextResponse.json({ error: 'upload disabled' }, { status: 503 });
    
    const context = await get_context(req) 
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
        const jobsCollection = await getScanJobsCollection()
        const insertion = await jobsCollection.insertOne({
            sheetId: new ObjectId(sheetId),
            timestamp: now,
            messages: [{  
                status: 'uploading',
                message: 'caricamento PDF',
                timestamp: now}],
            ownerId: user._id,
        })

        if (!insertion.acknowledged) {
            return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
        }
        const job_id = insertion.insertedId.toString()

        // Define upload path
        const filePath = path.join(SCANS_SPOOL_DIR, `${schema.name}-${job_id}.pdf`)

        try {
            // Save file to disk
            await writeFile(filePath, buffer);
        } catch (error) {
            console.error('Error writing file:', error);
            return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
        }

        return NextResponse.json({ 
            jobId: job_id
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
