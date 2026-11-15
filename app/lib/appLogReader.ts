import { open, readdir } from 'fs/promises'
import { constants } from 'fs'
import path from 'path'
import type { AppLogEntry } from './appLog'

/*
 * Reads the application logs written by appLog (LOG_DIR/app-YYYY-MM-DD.log)
 * for the admin «logs» page. Files are read backwards in chunks, so the most
 * recent entries of a large day are available without loading the whole file.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const FILE = /^app-(\d{4}-\d{2}-\d{2})\.log$/
const CHUNK = 64 * 1024
export const MAX_APP_LOG_ENTRIES = 5000

export async function listAppLogDays(directory: string): Promise<string[]> {
    try {
        const entries = await readdir(/* turbopackIgnore: true */ directory, { withFileTypes: true })
        return entries.filter(entry => entry.isFile()).map(entry => FILE.exec(entry.name)?.[1])
            .filter((day): day is string => !!day).sort().reverse()
    } catch {
        return []
    }
}

/*
 * Returns up to `limit` entries of the given day, newest first, and whether
 * older entries exist. Lines that are not valid entries are skipped.
 */
export async function readAppLog(directory: string, day: string, limit: number): Promise<{ entries: AppLogEntry[], truncated: boolean }> {
    if (!DAY.test(day)) return { entries: [], truncated: false }
    limit = Math.max(1, Math.min(MAX_APP_LOG_ENTRIES, Math.floor(limit)))
    let handle
    try {
        handle = await open(/* turbopackIgnore: true */ path.join(directory, `app-${day}.log`), constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch {
        return { entries: [], truncated: false }
    }
    try {
        const { size } = await handle.stat()
        const lines: string[] = []
        let position = size
        let partial = Buffer.alloc(0)
        // Collect one extra line to know whether older entries exist.
        while (position > 0 && lines.length <= limit) {
            const length = Math.min(CHUNK, position)
            position -= length
            const chunk = Buffer.alloc(length)
            await handle.read(chunk, 0, length, position)
            let data = Buffer.concat([chunk, partial])
            let end = data.length
            for (let index = data.length - 1; index >= 0 && lines.length <= limit; index--) {
                if (data[index] !== 0x0a) continue
                if (index + 1 < end) lines.push(data.subarray(index + 1, end).toString('utf8'))
                end = index
            }
            data = data.subarray(0, end)
            partial = data
        }
        if (position === 0 && partial.length && lines.length <= limit) lines.push(partial.toString('utf8'))

        const entries: AppLogEntry[] = []
        for (const line of lines) {
            if (entries.length === limit) break
            try {
                const entry = JSON.parse(line)
                if (entry && typeof entry.timestamp === 'string' && typeof entry.event === 'string') entries.push(entry)
            } catch {
                // Truncated or foreign line.
            }
        }
        return { entries, truncated: lines.length > limit }
    } finally {
        await handle.close()
    }
}
