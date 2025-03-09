import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { readFile } from 'fs/promises';
import { join } from 'path';

const SCANS_DATA_DIR = process.env.SCANS_DATA_DIR || '';

export async function GET(req: NextRequest, { params }: { params: { sheetId: string, jobId: string, filename: string } }) {
    const sheetId = new ObjectId(params.sheetId);
    const jobId = params.jobId;
    const filename = params.filename;
    
    if (!SCANS_DATA_DIR) {
        console.log(`environment variable SCANS_DATA_DIR not set`);
        return new NextResponse('Not Found', { status: 404 });
    }
    
    // TODO check permissions

    const filePath = join(SCANS_DATA_DIR, params.sheetId, params.jobId, params.filename);

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