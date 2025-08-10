import { getSheetsCollection, getScanJobsCollection, getSheetPermissions } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_user_can_edit_sheet } from './utils'
import { ScanJob } from '@/app/lib/models'

export default async function scans (_: unknown, { sheetId, userId }: { sheetId: ObjectId, userId: ObjectId }, context: Context) {
    const user = await get_authenticated_user(context)
    const sheets = await getSheetsCollection()
    const sheet = await sheets.findOne({_id: sheetId })
    if (!sheet) throw Error('foglio inesistente')
    const userPermissions = await getSheetPermissions(sheetId, user)
    await check_user_can_edit_sheet(user, sheet, userPermissions)
    const collection = await getScanJobsCollection()
    const match: {sheetId: ObjectId,userId?: ObjectId} = { sheetId }
    if (user?.is_admin || sheet.owner_id.equals(user._id)) {
        // questi utenti possono vedere tutti i job
        // e filtrarli per userId se specificato
        if (userId) match.userId = userId
    } else {
        // gli altri utenti vedono solo i job che hanno creato
        match.userId = user._id
    }
    const jobs: ScanJob[] = (await collection
        .find(match)
        .sort({ timestamp: -1 })
        .toArray())
    return jobs
        .map(job => (
            {   ...job, 
                message: (job.messages.length > 0) 
                    ? job.messages[job.messages.length - 1] 
                    : null
            }))
}

