import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

export const redis = new Redis(redisUrl, {
  lazyConnect: false,
  enableOfflineQueue: true,
})
// Previene crash da unhandled 'error' event se Redis non è raggiungibile
redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message)
})

export const CURSOR_KEY = (sheetId: string) => `ACTIVE_CURSORS.${sheetId}`
