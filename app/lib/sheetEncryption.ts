import { createCipheriv, createDecipheriv, hkdfSync, pbkdf2, randomBytes } from 'node:crypto'
import type { Row, Sheet } from './models'
import { schemas } from './schema'

export type SheetEncryptionKey = { key: Buffer, salt: Buffer }
export async function deriveSheetEncryptionKey(password: string): Promise<SheetEncryptionKey> {
    const salt = randomBytes(16)
    const key = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, salt, 200000, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key))
    })
    return { key, salt }
}

export function createSheetEncryptor({ key, salt }: SheetEncryptionKey) {
    return (row: Row, sheet: Sheet): Record<string, string> => {
        if (row.encrypted_data) return {}
        const schema = schemas[sheet.schema]
        if (!schema) throw new Error('Schema del foglio sconosciuto.')
        const { encrypted_data, truncated_fields } = schema.encrypt(row.data || {}, plaintext => {
            const iv = randomBytes(12)
            const cipher = createCipheriv('aes-256-gcm', key, iv)
            const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
            return Buffer.from(JSON.stringify({ salt: salt.toString('base64'), iv: iv.toString('base64'),
                ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') })).toString('base64')
        })
        if (!encrypted_data) return {}
        return { encrypted_data, ...Object.fromEntries(Object.entries(truncated_fields).map(([field, value]) => [`data.${field}`, value])) }
    }
}

// This envelope is sent only via Redis Pub/Sub. It must never be stored in Redis or MongoDB.
function transportKey(secret: string | undefined) {
    if (!secret) throw new Error('Configurare NEXTAUTH_SECRET anche nel worker per la crittografia.')
    return Buffer.from(hkdfSync('sha256', secret, '', 'olifogli:sheet-encryption-transport:v1', 32))
}
function sealSecret(binding: string, material: Buffer, secret: string | undefined): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', transportKey(secret), iv)
    cipher.setAAD(Buffer.from(binding))
    const ct = Buffer.concat([cipher.update(material), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}
function openSecret(binding: string, envelope: string, secret: string | undefined): Buffer {
    const payload = Buffer.from(envelope, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', transportKey(secret), payload.subarray(0, 12))
    decipher.setAAD(Buffer.from(binding))
    decipher.setAuthTag(payload.subarray(12, 28))
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()])
}
export function sealSheetEncryptionKey(jobId: string, material: SheetEncryptionKey, secret = process.env.NEXTAUTH_SECRET): string {
    const packed = Buffer.concat([material.key, material.salt])
    try { return sealSecret(jobId, packed, secret) }
    finally { packed.fill(0) }
}
export function openSheetEncryptionKey(jobId: string, envelope: string, secret = process.env.NEXTAUTH_SECRET): SheetEncryptionKey {
    const material = openSecret(jobId, envelope, secret)
    try {
        if (material.length !== 48) throw new Error('Chiave di crittografia non valida.')
        return { key: Buffer.from(material.subarray(0, 32)), salt: Buffer.from(material.subarray(32)) }
    } finally { material.fill(0) }
}

export function sealSheetDecryptionPassword(jobId: string, password: Buffer, secret = process.env.NEXTAUTH_SECRET): string {
    return sealSecret(`decrypt:${jobId}`, password, secret)
}
export function openSheetDecryptionPassword(jobId: string, envelope: string, secret = process.env.NEXTAUTH_SECRET): Buffer {
    return openSecret(`decrypt:${jobId}`, envelope, secret)
}

export function createSheetDecryptor(password: Buffer) {
    // Old jobs may have used different salts. Derive once per salt, only in memory.
    const keys = new Map<string, Buffer>()
    let disposed = false
    const decrypt = async (row: Row): Promise<Record<string, string>> => {
        if (disposed) throw new Error('Segreto di decrittazione non più disponibile.')
        if (!row.encrypted_data) return {}
        const payload = JSON.parse(Buffer.from(row.encrypted_data, 'base64').toString('utf8'))
        if (typeof payload.salt !== 'string' || typeof payload.iv !== 'string' || typeof payload.ct !== 'string' || typeof payload.tag !== 'string') {
            throw new Error('Dati cifrati non validi.')
        }
        const salt = Buffer.from(payload.salt, 'base64')
        const saltId = salt.toString('base64')
        let key = keys.get(saltId)
        if (!key) {
            key = await new Promise<Buffer>((resolve, reject) => {
                pbkdf2(password, salt, 200000, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key))
            })
            if (disposed) { key.fill(0); throw new Error('Segreto di decrittazione non più disponibile.') }
            keys.set(saltId, key)
        }
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
        decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
        const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ct, 'base64')), decipher.final()])
        try {
            const data = JSON.parse(plaintext.toString('utf8'))
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dati decriptati non validi.')
            const update: Record<string, string> = {}
            for (const [field, value] of Object.entries(data)) {
                if (typeof value !== 'string' || !field || /[.$\x00]/.test(field)) throw new Error('Campo decriptato non valido.')
                update[`data.${field}`] = value
            }
            return update
        } finally { plaintext.fill(0) }
    }
    return Object.assign(decrypt, { dispose() {
        disposed = true
        password.fill(0)
        for (const key of keys.values()) key.fill(0)
        keys.clear()
    } })
}
