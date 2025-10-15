import { getRowsCollection, getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationDeleteSheetsArgs } from '../generated'

export default async function deleteSheets (_: unknown, { ids }: MutationDeleteSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const rows = await getRowsCollection();
    const sheets = await getSheetsCollection();
    // Sposta le righe in deleted_rows tramite aggregazione, aggiungendo un timestamp e deletedBy
    const now = new Date()
    await rows.aggregate([
        { $match: { sheetId: { $in: ids } } },
        { $addFields: { deletedOn: now, deletedBy: user.email } },
        { $merge: { into: 'deleted_rows', whenMatched: 'replace', whenNotMatched: 'insert' } }
    ]).toArray(); // Esegui l'aggregazione
    // Cancella le righe originali
    await rows.deleteMany({ sheetId: { $in: ids } });
    // Sposta i fogli in deleted_sheets tramite aggregazione, aggiungendo un timestamp e deletedBy
    await sheets.aggregate([
        { $match: { _id: { $in: ids } } },
        { $addFields: { deletedOn: now, deletedBy: user.email } },
        { $merge: { into: 'deleted_sheets', whenMatched: 'replace', whenNotMatched: 'insert' } }
    ]).toArray(); // Esegui l'aggregazione
    // Cancella i fogli
    await sheets.deleteMany({_id: {$in: ids}})
    return true
}
