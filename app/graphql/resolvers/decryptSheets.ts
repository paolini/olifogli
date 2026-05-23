import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user } from './utils'
// use any for generated types to avoid codegen mismatch
import crypto from 'crypto'
import { ObjectId } from 'bson'

function deriveKey(password: string, salt: Buffer) {
    return crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256')
}

export default async function decryptSheets(_: unknown, { sheetIds, password }: { sheetIds?: ObjectId[] , password: string }, context: Context) {
    const user = await get_authenticated_user(context)
    if (!user?.isAdmin) throw new Error('only admins can decrypt sheets')

    if (!password) throw new Error('password required')

    const collection = await getSheetsCollection()
    const ids = sheetIds || []
    if (ids.length === 0) return true

    await Promise.all(ids.map(async (id) => {
        const doc = await collection.findOne({ _id: id })
        if (!doc) return
    }))

    // Now restore rows' encrypted_data for each sheet
    // launch background job to restore rows asynchronously; return immediately
    ;(async () => {
        try {
            await Promise.all(ids.map(async (id) => {
                const rows_collection = await getRowsCollection()
                for await (const row of rows_collection.find({ sheetId: id, encrypted_data: { $exists: true, $ne: '' } })) {
                    const payloadB64 = row.encrypted_data
                    if (!payloadB64) continue // non ci sono dati criptati, salta
                    try {
                        const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8')
                        const payload = JSON.parse(payloadJson)
                        const salt = Buffer.from(payload.salt, 'base64')
                        const iv = Buffer.from(payload.iv, 'base64')
                        const ct = Buffer.from(payload.ct, 'base64')
                        const tag = Buffer.from(payload.tag, 'base64')
                        const key = deriveKey(password, salt)
                        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
                        decipher.setAuthTag(tag)
                        const decrypted = Buffer.concat([decipher.update(ct), decipher.final()])
                        const obj = JSON.parse(decrypted.toString('utf8'))
                        const setObj: any = {}
                        for (const [k, v] of Object.entries(obj)) {
                            setObj[`data.${k}`] = v
                        }
                        await rows_collection.updateOne({ _id: row._id }, { $set: setObj, $unset: { encrypted_data: '' } })
                    } catch (e: unknown) {
                        console.error('decryptSheets: failed to restore row', { sheetId: id, rowId: row._id?.toString?.(), error: (e as Error)?.message })
                        continue
                    }
                }
            }))
        } catch (e) {
            console.error('decryptSheets background job failed:', e)
        }
    })()

    return true
}
