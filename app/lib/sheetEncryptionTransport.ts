import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'

const CHANNEL = 'olifogli:sheet-encryption-key:v1'
const ACK_PREFIX = `${CHANNEL}:ack:`
const connection = () => new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 3000,
})
async function ready(client: Redis) {
    if (client.status === 'ready') return
    await new Promise<void>((resolve, reject) => {
        const done = () => { client.off('error', failed); resolve() }
        const failed = (error: Error) => { client.off('ready', done); reject(error) }
        client.once('ready', done).once('error', failed)
    })
}

export async function deliverSheetEncryptionKey(jobId: string, envelope: string): Promise<void> {
    const subscriber = connection(), publisher = connection()
    // Errors are propagated by ready/commands; never log messages containing key material.
    subscriber.on('error', () => {})
    publisher.on('error', () => {})
    const reply = ACK_PREFIX + randomUUID()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        await Promise.all([ready(subscriber), ready(publisher)])
        await subscriber.subscribe(reply)
        const acknowledged = new Promise<void>((resolve, reject) => {
            subscriber.on('message', (channel, message) => { if (channel === reply && message === jobId) resolve() })
            timer = setTimeout(() => reject(new Error('Il worker non ha ricevuto la chiave. Verificare che sia avviato e riprovare.')), 5000)
        })
        // Subscribe before publishing, so even an immediate acknowledgement cannot be missed.
        await Promise.all([publisher.publish(CHANNEL, JSON.stringify({ jobId, envelope, reply })), acknowledged])
    } finally {
        clearTimeout(timer)
        subscriber.disconnect()
        publisher.disconnect()
    }
}

export async function receiveSheetEncryptionKeys(accept: (jobId: string, envelope: string) => Promise<boolean>) {
    const subscriber = connection(), publisher = connection()
    subscriber.on('error', () => {})
    publisher.on('error', () => {})
    try {
        await Promise.all([ready(subscriber), ready(publisher)])
        subscriber.on('message', (_channel, message) => {
            void (async () => {
                const { jobId, envelope, reply } = JSON.parse(message)
                if (typeof jobId !== 'string' || !/^[a-f0-9]{24}$/.test(jobId) || typeof envelope !== 'string' ||
                    typeof reply !== 'string' || !reply.startsWith(ACK_PREFIX)) return
                if (await accept(jobId, envelope)) await publisher.publish(reply, jobId)
            })().catch(() => { /* Invalid envelopes and transport failures never expose key material. */ })
        })
        await subscriber.subscribe(CHANNEL)
        return () => { subscriber.disconnect(); publisher.disconnect() }
    } catch (error) {
        subscriber.disconnect(); publisher.disconnect()
        throw error
    }
}
