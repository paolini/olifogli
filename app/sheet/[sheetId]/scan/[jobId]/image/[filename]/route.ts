import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ObjectId } from 'mongodb'

import { check_user_can_view_job, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { getScanJobsCollection } from '@/app/lib/mongodb'
import { get_context } from '@/app/graphql/types'

const SCANS_DATA_DIR = process.env.SCANS_DATA_DIR || '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ sheetId: string, jobId: string, filename: string }> }) {
    const {sheetId, jobId, filename} = await params
    const context = await get_context(req) 
    const user = await get_authenticated_user(context)

    if (!SCANS_DATA_DIR) {
        console.log(`environment variable SCANS_DATA_DIR not set`);
        return new NextResponse('Not Found', { status: 404 });
    }
    
    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({ _id: new ObjectId(jobId) })

    try {
        check_user_can_view_job(user,job)
    } catch (error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    
    const filePath = join(SCANS_DATA_DIR, sheetId, jobId, filename);

    try {
        const file = await readFile(filePath);
        return new NextResponse(file, {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        });
    } catch (error) {
        return new NextResponse('Not Found', { status: 404 });
    }
}
