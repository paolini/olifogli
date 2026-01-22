import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { ObjectId, Document } from 'mongodb'
import { Sheet } from '@/app/lib/models'

export default async function sheetsReportHelper(
    sheetIds: ObjectId[], 
    context: Context
): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()

    // restringe gli sheet
    // a cui l'utente ha accesso
    const sheetFilter: Document = { _id: { $in: sheetIds} }
    
    if (!(user.isAdmin || user.isSupervisor)) {
        sheetFilter.$or = [
            { ownerId: user._id },
            { 'permissions.email': user.email },
            { 'permissions.userId': user._id },
        ]
    }

    const allSheets = await sheetsCollection.find(sheetFilter).toArray()

    return allSheets
}

export async function getAllSheets(
    workbookId: ObjectId,
    schema: string | null,
    commonData: Record<string, string> | null,
    state: string | null,
    context: Context
): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()

    // console.log(`commonData: ${JSON.stringify(commonData)}`) // DEBUG

    // restringe gli sheet
    // a cui l'utente ha accesso
    const sheetFilter: Document = { 
        workbookId: workbookId,
        ...schema ? { schema } : {},
        ...commonData ? { ...Object.fromEntries(Object.entries(commonData).map(([key, value]: [string, string]) => ([`commonData.${key}`, value]))) } : {},
        ...state === 'open' ? { closed: { $ne: true }, locked: { $ne: true } } : {},
        ...state === 'closed_or_locked' ? { $or: [ { closed: true }, { locked: true } ] } : {},
        ...state === 'closed_not_locked' ? { closed: true, locked: { $ne: true } } : {},
        ...state === 'locked' ? { locked: true } : {},
    }
    
    if (!(user.isAdmin || user.isSupervisor)) {
        sheetFilter.$or = [
            { ownerId: user._id },
            { 'permissions.email': user.email },
            { 'permissions.userId': user._id },
        ]
    }

    // console.log("Sheet filter:", JSON.stringify(sheetFilter)) // DEBUG
    
    const allSheets = await sheetsCollection.find(sheetFilter).toArray()

    // console.log(`Found ${allSheets.length} sheets matching filter`) // DEBUG
    
    return allSheets
}
