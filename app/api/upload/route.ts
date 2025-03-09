import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { getScansCollection } from '@/app/lib/models';


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
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const sheetId = formData.get('sheetId');
    // const secret = formData.get('secret');

    const SCANS_SPOOL_DIR = await getSCANS_SPOOL_DIR();

    if (!SCANS_SPOOL_DIR) {
        return NextResponse.json({ error: 'upload disabled' }, { status: 503 });
    }

    /*
    // TODO: validate request
    if (secret !== SECRET_CODE) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    */

    if (!file) {
        return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
        return NextResponse.json({ error: 'Invalid file type, only PDF allowed' }, { status: 400 });
    }

    if (!sheetId) {
        return NextResponse.json({ error: 'Missing sheetId' }, { status: 400 });
    }
  
    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Define upload path
    const job_id = Math.random().toString(36).substring(2,10);
    const filePath = path.join(SCANS_SPOOL_DIR, sheetId + '-' + job_id + '.pdf');

    // Save file to disk
    await writeFile(filePath, buffer);

    const scansCollection = await getScansCollection();

    return NextResponse.json({ 
        job_id
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
