import type { Context } from '../types'
import type { ObjectId } from 'bson'
import { requestSheetCryptography } from './cryptSheets'

export default async function decryptSheets(_: unknown, args: { sheetIds?: ObjectId[], password: string }, context: Context) {
    return requestSheetCryptography(args, context, 'decrypt_sheets')
}
