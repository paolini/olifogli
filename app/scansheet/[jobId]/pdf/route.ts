import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ObjectId } from 'mongodb'

import { check_user_can_view_sheet, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { getScanSheetJobsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { get_context } from '@/app/graphql/types'
import fs from 'fs'

const SHEETGENDATA_DIR = process.env.SHEETGENDATA_DIR || '/app/sheetgendata';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params
    console.log(`[PDF] Request for jobId: ${jobId}`)
    
    const context = await get_context(req) 
    const user = await get_authenticated_user(context)
    console.log(`[PDF] User authenticated: ${user?.email || 'anonymous'}`)

    console.log(`[PDF] SHEETGENDATA_DIR: ${SHEETGENDATA_DIR}`)
    
    const jobs = await getScanSheetJobsCollection()
    const job = await jobs.findOne({ _id: new ObjectId(jobId) })

    if (!job) {
        console.log(`[PDF] Job not found: ${jobId}`)
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    
    console.log(`[PDF] Job found, sheetId: ${job.sheetId}`)

    // Verifica i permessi sul foglio
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({ _id: job.sheetId })

    if (!sheet) {
        console.log(`[PDF] Sheet not found: ${job.sheetId}`)
        return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    }

    try {
        check_user_can_view_sheet(user, sheet)
        console.log(`[PDF] Permission check passed`)
    } catch (error) {
        console.log(`[PDF] Permission denied for user ${user?.email}`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    
    // Il file PDF dovrebbe essere nella directory SHEETGENDATA_DIR/{jobId}/*.pdf
    const jobDir = join(SHEETGENDATA_DIR, jobId);
    console.log(`[PDF] Looking for PDF in: ${jobDir}`)
    
    try {
        const files = fs.readdirSync(jobDir);
        console.log(`[PDF] Files found in directory: ${files.join(', ')}`)
        const pdfFile = files.find((f: string) => f.endsWith('.pdf'));
        
        if (!pdfFile) {
            console.log(`[PDF] No PDF file found in directory`)
            return new NextResponse('PDF not found', { status: 404 });
        }

        const filePath = join(jobDir, pdfFile);
        console.log(`[PDF] Reading file: ${filePath}`)
        const file = await readFile(filePath);
        console.log(`[PDF] File read successfully, size: ${file.length} bytes`)
        
        return new NextResponse(new Uint8Array(file), {
            status: 200,
            headers: { 
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${pdfFile}"`
            },
        });
    } catch (error) {
        console.error(`[PDF] Error reading PDF for job ${jobId}:`, error);
        return new NextResponse('Not Found', { status: 404 });
    }
}
