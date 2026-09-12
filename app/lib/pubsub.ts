import Redis from 'ioredis'
import { RedisPubSub } from 'graphql-redis-subscriptions'

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

const publisher = new Redis(redisUrl)
const subscriber = new Redis(redisUrl)

export const pubsub = new RedisPubSub({ publisher, subscriber })

export const TOPICS = {
	ROW_CHANGED: (sheetId: string) => `ROW_CHANGED.${sheetId}`,
	ROWS_DELETED: (sheetId: string) => `ROWS_DELETED.${sheetId}`,
	SHEET_UPDATED: (sheetId: string) => `SHEET_UPDATED.${sheetId}`,
	CURSOR_CHANGED: (sheetId: string) => `CURSOR_CHANGED.${sheetId}`,
	WORKBOOK_UPDATED: (workbookId: string) => `WORKBOOK_UPDATED.${workbookId}`,
	SCAN_JOB_UPDATED: (sheetId: string) => `SCAN_JOB_UPDATED.${sheetId}`,
	SCAN_SHEET_JOB_UPDATED: (sheetId: string) => `SCAN_SHEET_JOB_UPDATED.${sheetId}`,
}

export default pubsub
