import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin, parse_sheet_permissions } from './utils'
import { MutationAddSheetsArgs } from '../generated'

export default async function addSheets (_: unknown, { sheets }: MutationAddSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const collection = await getSheetsCollection()
    const now = new Date()
    const result = await collection.insertMany(sheets.map(sheet => {
        const permissions = parse_sheet_permissions(sheet.permissions)
        
        return {
            commonData: {},
            nRows: 0,
            nValidRows: 0,
            anomalies: 0,
            nSyncedRows: 0,
            nScanJobs: 0,
            nScanSheetJobs: 0,
            ...sheet,
            createdBy: user.email,
            permissions,
            createdAt: now,
            updatedAt: now,
        }
    }))
    if (!result.acknowledged) throw new Error("Failed to add sheets")
    return true
}
