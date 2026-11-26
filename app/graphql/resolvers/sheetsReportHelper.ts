import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection } from '@/app/lib/mongodb'
import { ObjectId, Document } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { classifySchoolCode, sheetSchoolCode } from '@/app/lib/schoolCode'

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
        sheetFilter['permissions.email'] = user.email
    }

    const allSheets = await sheetsCollection.find(sheetFilter).toArray()

    return allSheets
}

export async function getAllSheets(
    workbookId: ObjectId,
    schema: string | null,
    commonData: Record<string, string> | null,
    state: string | null,
    context: Context,
    school: { macroarea?: string | null, indirizzo?: string | null } = {},
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
        ...state === 'closed_not_locked' ? { closed: true, locked: { $ne: true } } : {},
        ...state === 'locked' ? { locked: true } : {},
    }
    // Both the state and the permissions are $or conditions: combine them with
    // $and, so that neither replaces the other.
    const conditions: Document[] = []
    if (state === 'closed_or_locked') conditions.push({ $or: [ { closed: true }, { locked: true } ] })
    if (!(user.isAdmin || user.isSupervisor)) {
        conditions.push({ 'permissions.email': user.email })
    }
    if (conditions.length > 0) sheetFilter.$and = conditions

    // console.log("Sheet filter:", JSON.stringify(sheetFilter)) // DEBUG
    
    const allSheets = await sheetsCollection.find(sheetFilter).toArray()

    // console.log(`Found ${allSheets.length} sheets matching filter`) // DEBUG

    // Macroarea e indirizzo si ricavano dal codice meccanografico, non sono
    // salvati nel foglio: il filtro avviene qui e non nella query.
    const { macroarea, indirizzo } = school
    if (!macroarea && !indirizzo) return allSheets
    return allSheets.filter(sheet => {
        const classification = classifySchoolCode(sheetSchoolCode(sheet))
        return (!macroarea || classification.macroarea === macroarea)
            && (!indirizzo || classification.indirizzo === indirizzo)
    })
}
