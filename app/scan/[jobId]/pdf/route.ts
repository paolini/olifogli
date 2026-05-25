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
        console.log(`[PDF] Sheet not found: ${job.sheetId}`)
        return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    }

    try {
        check_user_can_view_sheet(user, sheet)
    } catch (error) {
        console.log(`[PDF] Permission denied for user ${user?.email}`)
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
            console.log(`[PDF] File not found in ${statusDir} directory: ${filePath}`)
            continue
        }

        try {
            console.log(`[PDF] Reading file: ${filePath}`)
            const file = await readFile(filePath);
            console.log(`[PDF] File read successfully, size: ${file.length} bytes`)

            return new NextResponse(new Uint8Array(file), {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${fileName}"`
                },
            });
        } catch (error) {
            console.error(`[PDF] Error reading file ${filePath}:`, error);
            continue
        }
    }
    
    console.error(`[PDF] PDF file not found for job ${jobId} in any status directory`);
    return new NextResponse('Not Found', { status: 404 });
}