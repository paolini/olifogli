import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { logDiagnostic, logSource, serverLog, type LogLevel } from './logging'

/*
 * Application logs: what happened in the application (GraphQL requests,
 * uploads, deletions, background jobs). Server only.
 *
 * Each entry is one JSON line in LOG_DIR/app-YYYY-MM-DD.log, shared by all
 * processes: appendFileSync opens the file with O_APPEND and writes the line
 * with a single write, so lines from different processes never interleave on
 * a local filesystem. Without LOG_DIR (development) entries go to stdout.
 *
 * Entries contain operational metadata only. The id of the user who performed
 * an operation is allowed (userId); names, emails, row data, messages and
 * payloads are not (issue #39, docs/deploy.md).
 */

export type AppLogValue = string | number | boolean | null | string[]

export type AppLogEntry = {
    timestamp: string
    level: LogLevel
    source: string
    event: string
    userId?: string
    [field: string]: AppLogValue | undefined
}

export type AppLogPublisher = (entry: AppLogEntry) => Promise<unknown>

const RESERVED = new Set(['timestamp', 'level', 'source', 'event', 'userId'])
// Shared across the bundles of one process (Next.js compiles instrumentation
// and routes separately), so it lives on globalThis instead of module state.
const PUBLISHER = Symbol.for('olifogli.appLogPublisher')
const PUBLISH_FAILURE_INTERVAL_MS = 60_000
let lastPublishFailure = 0

export function appLogFileName(day: string): string {
    return `app-${day}.log`
}

/*
 * Registers the real-time publisher of this process (Redis Pub/Sub). Called
 * at startup by Next.js (instrumentation.ts), ws-server and the worker.
 */
export function setAppLogPublisher(publisher: AppLogPublisher | null): void {
    (globalThis as Record<symbol, unknown>)[PUBLISHER] = publisher
}

// event must be a static identifier at the call site.
export function appLog(event: string, fields: Record<string, AppLogValue> = {},
    options: { level?: LogLevel, userId?: { toString(): string } | null } = {}): AppLogEntry {
    const entry: AppLogEntry = {
        timestamp: new Date().toISOString(),
        level: options.level ?? 'info',
        source: logSource(),
        event,
        ...(options.userId ? { userId: options.userId.toString() } : {}),
    }
    for (const [key, value] of Object.entries(fields)) if (!RESERVED.has(key)) entry[key] = value

    const directory = process.env.LOG_DIR
    if (directory) {
        try {
            mkdirSync(directory, { recursive: true, mode: 0o700 })
            appendFileSync(join(directory, appLogFileName(entry.timestamp.slice(0, 10))), JSON.stringify(entry) + '\n', { mode: 0o600 })
        } catch (error) {
            logDiagnostic('app_log.write_failed', error)
        }
    } else {
        const { timestamp: _timestamp, level, source: _source, event: _event, ...rest } = entry
        serverLog(level, event, rest)
    }

    const publish = (globalThis as Record<symbol, AppLogPublisher | null | undefined>)[PUBLISHER]
    if (publish) {
        publish(entry).catch(error => {
            // One diagnostic per minute: a Redis outage must not flood stdout.
            const now = Date.now()
            if (now - lastPublishFailure < PUBLISH_FAILURE_INTERVAL_MS) return
            lastPublishFailure = now
            logDiagnostic('app_log.publish_failed', error, 'warn')
        })
    }
    return entry
}
