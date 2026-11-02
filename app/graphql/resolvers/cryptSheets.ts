import { getDb, withTransaction } from '@/app/lib/mongodb'
import { queueOlimanagerJob, jobCollections } from '@/app/lib/olimanagerJobs'
import { deriveSheetEncryptionKey, sealSheetEncryptionKey, sealSheetDecryptionPassword } from '@/app/lib/sheetEncryption'
import { deliverSheetEncryptionKey } from '@/app/lib/sheetEncryptionTransport'
import type { Context } from '../types'
import { get_authenticated_user } from './utils'
import type { ObjectId } from 'bson'

type Arguments = { sheetIds?: ObjectId[], password: string }
export async function requestSheetCryptography({ sheetIds, password }: Arguments, context: Context, operation: 'crypt_sheets' | 'decrypt_sheets') {
    const decrypt = operation === 'decrypt_sheets'
    const action = decrypt ? 'Decripta' : 'Cripta'
    const user = await get_authenticated_user(context)
    if (!user?.isAdmin) throw new Error(decrypt ? 'only admins can decrypt sheets' : 'only admins can crypt sheets')
    if (!password) throw new Error('password required')
    if (!sheetIds?.length) return true

    const material = decrypt ? null : await deriveSheetEncryptionKey(password)
    const secret = material ? material.key : Buffer.from(password, 'utf8')
    const seal = (id: string) => material ? sealSheetEncryptionKey(id, material) : sealSheetDecryptionPassword(id, secret)
    try {
        // Validate the shared transport secret before reserving sheets or enqueueing work.
        seal('configuration-check')
        const db = await getDb()
        const job = await queueOlimanagerJob(db, withTransaction, user, { sheetIds }, '', undefined, operation)
        try {
            await deliverSheetEncryptionKey(job._id.toString(), seal(job._id.toString()))
        } catch {
            // If delivery failed, release only a job the worker has not started yet.
            const { jobs, sheets } = jobCollections(db)
            const cancelled = await withTransaction(async session => {
                const result = await jobs.updateOne({ _id: job._id, status: 'queued' }, { $set: {
                    status: 'failed', finishedAt: new Date(), error: `Segreto non consegnato al worker. Avviare nuovamente ${action}.`,
                } }, { session })
                if (result.matchedCount) await sheets.updateMany({ olimanagerJobId: job._id }, { $unset: { olimanagerJobId: '' } }, { session })
                return result.matchedCount > 0
            })
            const current = await jobs.findOne({ _id: job._id })
            if (cancelled || !current || ['failed', 'completed_with_errors'].includes(current.status)) throw new Error(`Worker non disponibile per la ${decrypt ? 'decrittazione' : 'crittografia'}. Verificare che sia avviato e riprovare.`)
        }
        return true
    } finally {
        secret.fill(0)
    }
}

export default async function cryptSheets(_: unknown, args: Arguments, context: Context) {
    return requestSheetCryptography(args, context, 'crypt_sheets')
}
