import { ObjectId } from 'mongodb'
import { Context } from '../types'
import { get_authenticated_user, check_admin } from './utils'
import { getSettingsCollection } from '@/app/lib/mongodb'

export async function getSetting(_: unknown, args: { key: string }, context: Context) {
    // Chiunque autenticato può leggere un setting
    // se la chiave non inizia con "public_" allora
    // non è neanche necessario essere autenticati
    if (!args.key.startsWith('public_')) await get_authenticated_user(context)
    
    const collection = await getSettingsCollection()
    const setting = await collection.findOne({ key: args.key })

    return setting
}

export async function updateSetting(_: unknown, args: { key: string, value: string }, context: Context) {
    // Solo gli admin possono modificare i settings
    const user = await get_authenticated_user(context)
    check_admin(user)
    
    const collection = await getSettingsCollection()
    
    const now = new Date()
    const updatedSetting = {
        key: args.key,
        value: args.value,
        updatedBy: user.email,
        updatedOn: now
    }
    
    // Upsert: crea se non esiste, aggiorna se esiste
    const result = await collection.findOneAndUpdate(
        { key: args.key },
        { $set: updatedSetting },
        { upsert: true, returnDocument: 'after' }
    )
    
    if (!result) {
        throw new Error('Failed to update setting')
    }
    
    return result
}

const settingsResolvers = {
    Query: {
        getSetting
    },
    Mutation: {
        updateSetting
    }
}

export default settingsResolvers
