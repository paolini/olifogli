import { getSheetsCollection } from '@/app/lib/mongodb'
import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { Permission } from '@/app/lib/models'
import { MutationUpdateSheetsArgs } from '../generated'

export default async function updateSheets (_: unknown, { sheets }: MutationUpdateSheetsArgs, context: Context) {
    const user = await get_authenticated_user(context)
    const collection = await getSheetsCollection()
    
    if (!user?.isAdmin) throw new Error("only admins can update sheets")

    // Aggiorna ogni foglio
    for (const sheetInput of sheets) {
        const sheetId = sheetInput._id
        
        // Verifica che il foglio esista
        const existingSheet = await collection.findOne({ _id: sheetId })
        if (!existingSheet) {
            throw new Error(`Sheet ${sheetInput._id} not found`)
        }
        
        // Prepara l'update
        const update: {
            permissions?: Permission[]
            commonData?: Record<string, string>
            locked?: boolean
        } = {}
        
        if (sheetInput.permissions) {
            // Converti PermissionInput a Permission
            const newPermissions = sheetInput.permissions.map(p => ({
                email: p.email,
                role: p.role
            }))
            
            // Merge con i permessi esistenti, evitando duplicati
            const mergedPermissions = [...(existingSheet.permissions || [])]
            for (const newPerm of newPermissions) {
                const isDuplicate = mergedPermissions.some(existingPerm =>
                    (newPerm.email && existingPerm.email === newPerm.email)
                )
                if (!isDuplicate) {
                    mergedPermissions.push(newPerm as Permission)
                }
            }
            update.permissions = mergedPermissions
        }
        
        if (sheetInput.commonData) {
            update.commonData = {
                ...existingSheet.commonData,
                ...sheetInput.commonData
            }
        }

        if (sheetInput.locked !== undefined && sheetInput.locked !== null) {
            update.locked = sheetInput.locked
        }
        
        // Esegui l'update
        const result = await collection.updateOne(
            { _id: sheetId },
            { $set: update }
        )
        
        if (!result.acknowledged) {
            throw new Error(`Failed to update sheet ${sheetInput._id}`)
        }
    }
    
    return true
}
