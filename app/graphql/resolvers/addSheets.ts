import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'

import { get_authenticated_user, check_admin } from './utils'
import { MutationAddSheetsArgs } from '../generated'

export default async function addSheets (_: unknown, { sheets }: MutationAddSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    check_admin(user)
    const collection = await getSheetsCollection()
    const now = new Date()
    const result = await collection.insertMany(sheets.map(sheet => {
        // Converti PermissionInput a Permission
        const permissions = (sheet.permissions || []).map(p => ({
            email: p.email || undefined,
            userId: p.userId || undefined,
            role: p.role as 'admin' | 'editor'
        }))
        
        return {
            commonData: {},
            ...sheet,
            ownerId: user._id,
            permissions,
            createdAt: now,
        }
    }))
    if (!result.acknowledged) throw new Error("Failed to add sheets")
    return true
}
