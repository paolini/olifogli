import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsTimeDistributionReportArgs, TimeDistributionReport, TimeDistributionItem } from '../generated'
import { ObjectId, WithId, Document } from 'mongodb'
import { Sheet } from '@/app/lib/models'

export default async function sheetsTimeDistributionReport(
    _: unknown, 
    { sheetIds, schema }: QuerySheetsTimeDistributionReportArgs, 
    context: Context
): Promise<TimeDistributionReport> {
    const allSheets = await sheetsReportHelper(sheetIds.map(id => new ObjectId(id)), context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    return {
        schema,
        timeDistribution: await generateTimeDistributionReport(sheets)
    }
}

export async function sheetsReportHelper(
    sheetIds: ObjectId[], 
    context: Context
): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()

    // restringe gli sheetcon schema archimede_biennio o archimede_triennio
    // a cui l'utente ha accesso
    const sheetFilter: Document = { _id: { $in: sheetIds} }
    
    if (!user.isAdmin) {
        sheetFilter.$or = [
            { ownerId: user._id },
            { 'permissions.email': user.email },
            { 'permissions.userId': user._id },
        ]
    }

    const allSheets = await sheetsCollection.find(sheetFilter).toArray()

    return allSheets
}


async function generateTimeDistributionReport(sheets: WithId<Sheet>[]): Promise<TimeDistributionItem[]> {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds }
    }).toArray()

    // Raggruppa per ora (arrotonda minuti e secondi a zero)
    const hourMap = new Map<string, { total: number, valid: number }>()
    for (const row of rows) {
        const time = row.updatedOn
        const hourDate = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), 0, 0, 0)
        const hour = hourDate.toISOString()
        const isValid = row.error === ''
        const current = hourMap.get(hour) || { total: 0, valid: 0 }
        current.total += 1
        if (isValid) current.valid += 1
        hourMap.set(hour, current)
    }

    // Raggruppa i sheet chiusi per ora
    const closedMap = new Map<string, number>()
    for (const sheet of sheets) {
        if (sheet.closed && sheet.closedOn) {
            const time = sheet.closedOn
            const hourDate = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), 0, 0, 0)
            const hour = hourDate.toISOString()
            closedMap.set(hour, (closedMap.get(hour) || 0) + 1)
        }
    }

    // Ottieni tutte le ore uniche da entrambe le mappe
    const allHours = new Set([...hourMap.keys(), ...closedMap.keys()])
    const sortedHours = Array.from(allHours).sort()

    // Calcola cumulativo
    let cumulativeTotal = 0
    let cumulativeValid = 0
    let cumulativeClosed = 0
    const timeDistribution: TimeDistributionItem[] = sortedHours.map(hour => {
        const rowData = hourMap.get(hour) || { total: 0, valid: 0 }
        const closedCount = closedMap.get(hour) || 0
        cumulativeTotal += rowData.total
        cumulativeValid += rowData.valid
        cumulativeClosed += closedCount
        return { 
            hour, 
            rows: rowData.total, 
            validRows: rowData.valid, 
            cumulativeRows: cumulativeTotal, 
            cumulativeValidRows: cumulativeValid,
            closedSheets: closedCount,
            cumulativeClosedSheets: cumulativeClosed
        }
    })

    return timeDistribution
}