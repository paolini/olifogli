import { lstat, readdir, realpath, rmdir, unlink } from 'fs/promises'
import path from 'path'

/*
 * Files shared with the archiomr workers (see docs/omr.md). Every path that
 * reaches this module comes from an admin request and is untrusted: it must be
 * relative to one of the configured areas and must not cross symlinks.
 */

export type WorkerFileKind = 'scan' | 'sheet'

export type WorkerFileArea = {
    area: string
    label: string
    kind: WorkerFileKind
    dir: string
}

export type WorkerFileFolder =
    'queued' | 'staging' | 'processing' | 'completed' | 'aborted' | 'tmp' | 'data' | 'other'

export type WorkerFile = {
    area: string
    kind: WorkerFileKind
    path: string
    folder: WorkerFileFolder
    jobId: string | null
    size: number
    modifiedAt: Date
}

const SPOOL_SUBFOLDERS = new Set(['processing', 'completed', 'aborted', 'tmp'])
const MAX_DEPTH = 6

export function workerFileAreas(env: NodeJS.ProcessEnv = process.env): WorkerFileArea[] {
    const areas: WorkerFileArea[] = [
        { area: 'scans-spool', label: 'Scansioni: spool', kind: 'scan', dir: env.SCANS_SPOOL_DIR || '' },
        { area: 'scans-data', label: 'Scansioni: immagini', kind: 'scan', dir: env.SCANS_DATA_DIR || '' },
        { area: 'sheets-spool', label: 'Fogli generati: spool', kind: 'sheet', dir: env.SHEETGENSPOOL_DIR || '/app/sheetgenspool' },
        { area: 'sheets-data', label: 'Fogli generati: PDF', kind: 'sheet', dir: env.SHEETGENDATA_DIR || '/app/sheetgendata' },
    ]
    return areas.filter(area => area.dir)
}

function findArea(area: string, env?: NodeJS.ProcessEnv): WorkerFileArea {
    const found = workerFileAreas(env).find(a => a.area === area)
    if (!found) throw new Error('Area non valida')
    return found
}

export function jobIdOf(relativePath: string): string | null {
    // `{schema}-{jobId}.pdf`, `{jobId}/…`, and tmp dirs named `{jobId}{random}`.
    return relativePath.match(/[0-9a-f]{24}/i)?.[0].toLowerCase() ?? null
}

export function folderOf(area: WorkerFileArea, relativePath: string): WorkerFileFolder {
    const segments = relativePath.split('/')
    if (area.area.endsWith('-data')) return 'data'
    if (segments.length === 1) return relativePath.endsWith('.part') ? 'staging' : 'queued'
    return SPOOL_SUBFOLDERS.has(segments[0]) ? segments[0] as WorkerFileFolder : 'other'
}

function validRelativePath(relativePath: string): boolean {
    if (!relativePath || relativePath.length > 1024) return false
    if (/[\\\x00-\x1f\x7f]/.test(relativePath)) return false
    if (relativePath.startsWith('/')) return false
    return relativePath.split('/').every(segment => segment && segment !== '.' && segment !== '..')
}

/*
 * Returns the absolute path of a regular file inside the area, or null.
 * Rejects traversal and any symlink along the path, including the file itself.
 */
export async function resolveWorkerFile(area: string, relativePath: string, env?: NodeJS.ProcessEnv): Promise<string | null> {
    if (!validRelativePath(relativePath)) return null
    let root: string
    try {
        root = await realpath(/* turbopackIgnore: true */ findArea(area, env).dir)
    } catch {
        return null
    }
    const filePath = path.join(root, ...relativePath.split('/'))
    if (!filePath.startsWith(root + path.sep)) return null
    try {
        if (await realpath(/* turbopackIgnore: true */ filePath) !== filePath) return null
        const stat = await lstat(/* turbopackIgnore: true */ filePath)
        return stat.isFile() ? filePath : null
    } catch {
        return null
    }
}

export type WorkerFileListing = {
    areas: (WorkerFileArea & { available: boolean })[]
    files: WorkerFile[]
}

export async function listWorkerFiles(env?: NodeJS.ProcessEnv): Promise<WorkerFileListing> {
    const areas: WorkerFileListing['areas'] = []
    const files: WorkerFile[] = []
    for (const area of workerFileAreas(env)) {
        let root: string
        try {
            root = await realpath(/* turbopackIgnore: true */ area.dir)
        } catch {
            areas.push({ ...area, available: false })
            continue
        }
        areas.push({ ...area, available: true })
        await walk(area, root, '', 0, files)
    }
    return { areas, files }
}

async function walk(area: WorkerFileArea, root: string, prefix: string, depth: number, files: WorkerFile[]) {
    if (depth > MAX_DEPTH) return
    let entries
    try {
        entries = await readdir(/* turbopackIgnore: true */ path.join(root, prefix), { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        // Symlinks are neither followed nor listed.
        if (entry.isDirectory()) {
            await walk(area, root, relativePath, depth + 1, files)
        } else if (entry.isFile()) {
            try {
                const stat = await lstat(/* turbopackIgnore: true */ path.join(root, relativePath))
                files.push({
                    area: area.area, kind: area.kind, path: relativePath,
                    folder: folderOf(area, relativePath), jobId: jobIdOf(relativePath),
                    size: stat.size, modifiedAt: stat.mtime,
                })
            } catch {
                // Removed by a worker while listing.
            }
        }
    }
}

/*
 * Deletes one file and then the directories left empty below it, except the
 * area root and the standard spool folders that the workers expect.
 * Returns false when the path does not identify a deletable file.
 */
export async function deleteWorkerFile(area: string, relativePath: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
    const filePath = await resolveWorkerFile(area, relativePath, env)
    if (!filePath) return false
    try {
        await unlink(/* turbopackIgnore: true */ filePath)
    } catch {
        return false
    }
    const segments = relativePath.split('/').slice(0, -1)
    const root = filePath.slice(0, filePath.length - relativePath.length - 1)
    while (segments.length > 0) {
        if (segments.length === 1 && SPOOL_SUBFOLDERS.has(segments[0]) && area.endsWith('-spool')) break
        try {
            await rmdir(/* turbopackIgnore: true */ path.join(root, ...segments))
        } catch {
            break // not empty
        }
        segments.pop()
    }
    return true
}
