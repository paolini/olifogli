import { getRowsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user } from './utils'
// use any for generated types to avoid codegen mismatch
import crypto from 'crypto'
import { schemas } from '@/app/lib/schema'
import { ObjectId } from 'bson'

function deriveKey(password: string, salt: Buffer) {
    return crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256')
}

export default async function cryptSheets(_: unknown, { sheetIds, password }: { sheetIds?: ObjectId[] , password: string }, context: Context) {
    const user = await get_authenticated_user(context)
    if (!user?.isAdmin) throw new Error('only admins can crypt sheets')

    if (!password) throw new Error('password required')

    const sheets_collection = await getSheetsCollection()
    const rows_collection = await getRowsCollection()
    const ids = sheetIds || []
    if (ids.length === 0) return true

    const salt = crypto.randomBytes(16)
    const key = deriveKey(password, salt)

    const makeEncryptFunction = () => {
        return (plaintext: string) => {
            const iv = crypto.randomBytes(12)
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
            const tag = cipher.getAuthTag()
            const payloadObj = {
                salt: salt.toString('base64'),
                iv: iv.toString('base64'),
                ct: encrypted.toString('base64'),
                tag: tag.toString('base64')
            }
            return Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64')
        }
    }

    // launch background encryption job and return immediately
    ;(async () => {
        try {
            await Promise.all(ids.map(async (id) => {
                try {
                    const doc = await sheets_collection.findOne({ _id: id })
                    if (!doc) return
                    const schema = schemas[doc.schema]
                    const encryptFn = makeEncryptFunction()

                    for await (const row of rows_collection.find({ sheetId: id })) {
                        if (row.encrypted_data) continue; // skip already encrypted rows
                        try {
                            const { encrypted_data, truncated_fields } = schema.encrypt(row.data || {}, encryptFn)
                            if (encrypted_data) {
                                const setObj: Record<string, string> = { encrypted_data }
                                for (const [k, v] of Object.entries(truncated_fields || {})) {
                                    setObj[`data.${k}`] = v
                                }
                                await rows_collection.updateOne({ _id: row._id }, { $set: setObj })
                            }
                        } catch (e: unknown) {
                            console.error('cryptSheets: failed to encrypt row', { sheetId: id, rowId: row._id?.toString?.(), error: (e as Error)?.message })
                            continue
                        }
                    }
                } catch (e) {
                    console.error('cryptSheets: failed for sheet', { sheetId: id, error: (e as Error)?.message })
                    return
                }
            }))
        } catch (e) {
            console.error('cryptSheets background job failed:', e)
        }
    })()

    return true
}
