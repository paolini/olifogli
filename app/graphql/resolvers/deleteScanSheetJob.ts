import { appLog } from '@/app/lib/appLog'
import { getScanSheetJobsCollection, getSheetsCollection, withTransaction } from '@/app/lib/mongodb'
import { deleteWorkerFile, listWorkerFiles } from '@/app/lib/workerFiles'
import { TOPICS } from '@/app/lib/pubsub'
import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_user_is_sheet_admin } from './utils'

/*
 * Deletes a generated answer-sheet job together with its files (the PDF and any
 * leftover spool file). The files go first: if one cannot be deleted the job is
 * kept, so the PDF never becomes an orphan.
 */
export default async function deleteScanSheetJob(_: unknown, { jobId }: { jobId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const jobs = await getScanSheetJobsCollection()
    const job = await jobs.findOne({ _id: jobId })
    if (!job) throw new Error('Generazione fogli non trovata')
    const sheets = await getSheetsCollection()
    check_user_is_sheet_admin(user, await sheets.findOne({ _id: job.sheetId }))
    if (job.status === 'processing') throw new Error('Il PDF è in elaborazione: riprova quando è terminata')

    const id = jobId.toString()
    const { files } = await listWorkerFiles()
    let failed = 0
    for (const file of files.filter(file => file.kind === 'sheet' && file.jobId === id)) {
        const outcome = await deleteWorkerFile(file.area, file.path)
        if (outcome !== 'deleted' && outcome !== 'not_found') failed++
    }
    if (failed > 0) {
        appLog('scan_sheets.delete_failed', { jobId: id, sheetId: job.sheetId.toString(), failed }, { level: 'warn', userId: user._id })
        throw new Error('Non è stato possibile cancellare i file del PDF: contatta un amministratore')
    }

    await withTransaction(async (session) => {
        const { deletedCount } = await jobs.deleteOne({ _id: jobId }, { session })
        if (deletedCount) await sheets.updateOne({ _id: job.sheetId }, { $inc: { nScanSheetJobs: -1 } }, { session })
    })

    // A deleted MongoDB document no longer contains the sheetId for the watcher.
    await context.pubsub?.publish(TOPICS.SCAN_SHEET_JOB_UPDATED(job.sheetId.toString()), { scanSheetJobUpdated: true })

    appLog('scan_sheets.deleted', { jobId: id, sheetId: job.sheetId.toString() }, { userId: user._id })

    return true
}
