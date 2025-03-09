import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { readFile } from 'fs/promises';
import { join } from 'path';

const SCANS_DATA_DIR = process.env.SCANS_DATA_DIR || '';

export async function GET(req: Request, { params }: { params: Promise<{ sheetId: string, jobId: string, filename: string }> }) {
    const {sheetId, jobId, filename} = await params;
    
    if (!SCANS_DATA_DIR) {
        console.log(`environment variable SCANS_DATA_DIR not set`);
        return new NextResponse('Not Found', { status: 404 });
    }
    
    // TODO check permissions

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
