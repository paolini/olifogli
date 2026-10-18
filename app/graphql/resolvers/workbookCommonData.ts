import type { Context } from '../types'
import type { Data } from '@/app/lib/models'
import { get_authenticated_user } from './utils'

// Workbook configuration stays private unless a field is explicitly listed here.
export const TEACHER_READABLE_WORKBOOK_FIELDS = [
    'contest_year',
] as const

export default async function workbookCommonData(
    parent: { commonData?: Data | null }, _: unknown, context: Context,
): Promise<Data> {
    const user = await get_authenticated_user(context)
    const data = parent.commonData ?? {}
    if (user.isAdmin || user.isSupervisor) return data
    return Object.fromEntries(TEACHER_READABLE_WORKBOOK_FIELDS
        .filter(key => Object.hasOwn(data, key))
        .map(key => [key, data[key]]))
}
