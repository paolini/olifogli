import { getWorkbooksCollection } from '@/app/lib/mongodb'
import { venueSheetChoices, loadVenueSheets } from '@/app/lib/olimanagerVenueSheets'
import { check_admin, get_authenticated_user } from './utils'
import type { Context } from '../types'
import type { ObjectId } from 'bson'

async function authorize(context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    if (!context.req) throw new Error('Sessione HTTP richiesta.')
    return { user, req: context.req }
}

export async function olimanagerVenueSheetChoices(_: unknown, __: unknown, context: Context) {
    const { req } = await authorize(context)
    return venueSheetChoices(req)
}

export async function prepareOlimanagerVenueSheets(_: unknown, args: { workbookId: ObjectId, olympiadId: string, editionId: string, schema: string, contestId: number }, context: Context) {
    const { user, req } = await authorize(context)
    const workbooks = await getWorkbooksCollection()
    if (!await workbooks.findOne({ _id: args.workbookId })) throw new Error('Workbook non trovato.')
    const preview = await loadVenueSheets(req, args.olympiadId, args.editionId, args.schema, args.contestId)
    // Patch individual keys so concurrent edits to other settings are preserved.
    const result = await workbooks.updateOne({ _id: args.workbookId }, { $set: {
        'commonData.olimanager_olympiad_id': args.olympiadId,
        'commonData.olimanager_edition_id': args.editionId,
        updatedOn: new Date(), updatedBy: user.email,
    } })
    if (!result.acknowledged || !result.matchedCount) throw new Error('Configurazione non salvata.')
    return preview
}
