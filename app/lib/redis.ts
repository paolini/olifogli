import { logDiagnostic } from './logging'
import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

export const redis = new Redis(redisUrl, {
  lazyConnect: false,
  enableOfflineQueue: true,
})
// Previene crash da unhandled 'error' event se Redis non è raggiungibile
redis.on('error', (err) => {
  logDiagnostic('app/lib/redis.redis_connection_error', err)
})

// Fields are `<userId>:<tabId>` (CURSOR_FIELD). The previous ACTIVE_CURSORS.* hashes,
// keyed by tabId only, are no longer read.
export const CURSOR_KEY = (sheetId: string) => `SHEET_CURSORS.${sheetId}`
export const CURSOR_FIELD = (userId: string, tabId: string) => `${userId}:${tabId}`
