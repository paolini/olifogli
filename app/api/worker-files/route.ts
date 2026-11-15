import { NextRequest, NextResponse } from 'next/server'
import { open } from 'fs/promises'
import { constants } from 'fs'
import path from 'path'
import { Readable } from 'stream'

import { get_context } from '@/app/graphql/types'
import { get_authenticated_user } from '@/app/graphql/resolvers/utils'
import { resolveWorkerFile } from '@/app/lib/workerFiles'

// Shown inline when opened from the admin page; everything else is downloaded.
const INLINE_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
}

/*
 * GET /api/worker-files?area=…&path=…[&download=1]
 * Admin only: serves a file shared with the archiomr workers.
 */
export async function GET(req: NextRequest) {
    const context = await get_context({ req })
    const user = await get_authenticated_user(context).catch(() => null)
    if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const area = req.nextUrl.searchParams.get('area') || ''
    const relativePath = req.nextUrl.searchParams.get('path') || ''
    const filePath = await resolveWorkerFile(area, relativePath)
    if (!filePath) return new NextResponse('Not Found', { status: 404 })

    let handle
    try {
        handle = await open(/* turbopackIgnore: true */ filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        const stat = await handle.stat()
        if (!stat.isFile()) {
            await handle.close()
            return new NextResponse('Not Found', { status: 404 })
        }
        const name = path.basename(filePath)
        const inlineType = INLINE_TYPES[path.extname(name).toLowerCase()]
        const download = req.nextUrl.searchParams.get('download') === '1' || !inlineType
        // The stream closes the handle when it ends or is cancelled.
        const body = Readable.toWeb(handle.createReadStream()) as ReadableStream
        return new NextResponse(body, {
            status: 200,
            headers: {
                'Content-Type': download ? 'application/octet-stream' : inlineType,
                'Content-Length': String(stat.size),
                'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store',
            },
        })
    } catch {
        await handle?.close().catch(() => {})
        return new NextResponse('Not Found', { status: 404 })
    }
}
