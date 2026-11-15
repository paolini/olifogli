import { Data } from '../models'

// Result of converting one scanned page: the existing row it updates (if any),
// the data to import and, when it must not be imported, the reason.
export type ScanMatch<R> = { row: R | undefined, data: Data, error?: string }

/**
 * Normalized student code used to match scans and rows: the number without
 * leading zeros. OMR marks unfilled digits with X; a code with no digits, or
 * zero, is blank ('') and never matches a row.
 */
export function studentCodeKey(code: unknown): string {
    const digits = `${code ?? ''}`.replaceAll('X', '').trim()
    if (!/^\d+$/.test(digits)) return ''
    const value = parseInt(digits, 10)
    return value > 0 ? `${value}` : ''
}

export function rowsByStudentCode<R extends { data: Data }>(rows: R[]): Record<string, R> {
    const result: Record<string, R> = {}
    for (const row of rows) {
        const key = studentCodeKey(row.data?.id)
        if (key) result[key] = row
    }
    return result
}

/**
 * Builds the scan_id → match dictionary. Pages of the same upload with the same
 * student code would overwrite each other (or create duplicate rows): they are
 * marked with an error and are not imported.
 */
export function withRepeatedStudentCodesFlagged<R>(entries: [string, ScanMatch<R>][]): Partial<Record<string, ScanMatch<R>>> {
    const count = new Map<string, number>()
    for (const [, match] of entries) {
        const key = studentCodeKey(match.data.id)
        if (key) count.set(key, (count.get(key) ?? 0) + 1)
    }
    return Object.fromEntries(entries.map(([scanId, match]) => {
        const key = studentCodeKey(match.data.id)
        if (!key || (count.get(key) ?? 0) < 2) return [scanId, match]
        return [scanId, { ...match, error: `codice studente ${key} ripetuto in più pagine: controllare le scansioni` }]
    }))
}
