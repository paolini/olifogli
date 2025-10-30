import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ObjectId } from 'mongodb'

import { check_user_can_view_sheet, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { getScanSheetJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { get_context } from '@/app/graphql/types'
import fs from 'fs'

const SHEETGENDATA_DIR = process.env.SHEETGENDATA_DIR || '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params
    const context = await get_context(req) 
    const user = await get_authenticated_user(context)

    if (!SHEETGENDATA_DIR) {
        console.log(`environment variable SHEETGENDATA_DIR not set`);
        return new NextResponse('Not Found', { status: 404 });
    }
    
    const jobs = await getScanSheetJobsCollection()
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
    
    // Il file PDF dovrebbe essere nella directory SHEETGENDATA_DIR/{jobId}/*.pdf
    const jobDir = join(SHEETGENDATA_DIR, jobId);
    
    try {
        const files = fs.readdirSync(jobDir);
        const pdfFile = files.find((f: string) => f.endsWith('.pdf'));
        
        if (!pdfFile) {
            return new NextResponse('PDF not found', { status: 404 });
        }

        const filePath = join(jobDir, pdfFile);
        const file = await readFile(filePath);
        
        return new NextResponse(new Uint8Array(file), {
            status: 200,
            headers: { 
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${pdfFile}"`
            },
        });
    } catch (error) {
        console.error(`Error reading PDF for job ${jobId}:`, error);
        return new NextResponse('Not Found', { status: 404 });
    }
}
