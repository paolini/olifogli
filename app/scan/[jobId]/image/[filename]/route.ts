import { NextRequest, NextResponse } from 'next/server'
import { open, realpath } from 'fs/promises'
import { constants } from 'fs'
import { join } from 'path'
import { ObjectId } from 'mongodb'

import { check_user_can_view_job, get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { getScanJobsCollection } from '@/app/lib/mongodb'
import { get_context } from '@/app/graphql/types'

const SCANS_DATA_DIR = process.env.SCANS_DATA_DIR || '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string, filename: string }> }) {
    const {jobId, filename} = await params
    const context = await get_context({ req }) 
    const user = await get_authenticated_user(context)

    if (!SCANS_DATA_DIR) {
        return new NextResponse('Not Found', { status: 404 });
    }

    // Route parameters are untrusted, regardless of the worker's filename format.
    if (!/^[a-f0-9]{24}$/i.test(jobId) ||
        !/^[^./\\%:\x00-\x1f\x7f][^/\\%:\x00-\x1f\x7f]*\.(png|jpe?g|webp|gif)$/i.test(filename) ||
        filename.includes('..')) {
        return new NextResponse('Not Found', { status: 404 });
    }

    const jobs = await getScanJobsCollection()
    const job = await jobs.findOne({ _id: new ObjectId(jobId) })

    try {
        check_user_can_view_job(user,job)
    } catch (error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        // Resolve the configured root, but reject symlinks in job/image paths,
        // including links to another job inside the same root.
        const root = await realpath(SCANS_DATA_DIR);
        const directory = join(root, jobId);
        if (await realpath(directory) !== directory) {
            return new NextResponse('Not Found', { status: 404 });
        }
        const filePath = join(directory, filename);
        if (await realpath(filePath) !== filePath) {
            return new NextResponse('Not Found', { status: 404 });
        }
        const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            if (!(await handle.stat()).isFile()) {
                return new NextResponse('Not Found', { status: 404 });
            }
            const file = await handle.readFile();
            const extension = filename.split('.').pop()!.toLowerCase();
            const contentType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
            return new NextResponse(new Uint8Array(file), {
                status: 200,
                headers: { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' },
            });
        } finally {
            await handle.close();
        }
    } catch (error) {
        return new NextResponse('Not Found', { status: 404 });
    }
}
