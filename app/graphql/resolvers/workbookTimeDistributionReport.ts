import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookTimeDistributionReportArgs, TimeDistributionReport, TimeDistributionItem } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { getAllSheets } from './sheetsReportHelper'   
import { schemas } from '@/app/lib/schema'
import Competition from '@/app/lib/schema/Competition'


export default async function workbookTimeDistributionReport(
    _: unknown, 
    { workbookId, schema, commonData, state }: QueryWorkbookTimeDistributionReportArgs, 
    context: Context
): Promise<TimeDistributionReport[]> {
    const allSheets = await getAllSheets(new ObjectId(workbookId), schema || null, commonData || {}, state || '', context)
    const allSchemas = Array.from(new Set(allSheets.map(s => s.schema)))

    const reports: TimeDistributionReport[] = []

    for (const schema of allSchemas) {
        if (schemas[schema] instanceof Competition) {  
            const sheets = allSheets.filter(s => s.schema === schema)
            reports.push({
                schema,
                timeDistribution: await generateTimeDistributionReport(sheets)
            })
        }
    }

    return reports
}

async function generateTimeDistributionReport(sheets: WithId<Sheet>[]): Promise<TimeDistributionItem[]> {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds }
    }).toArray()

    // Raggruppa
    function getHourKey(date: Date): string {
        // hour
        // const hourDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0)

        // day
        const hourDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)

        // six-hours
        // const hour = date.getHours()
        // const sixHourBlock = Math.floor(hour / 6) * 6
        // const hourDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), sixHourBlock, 0, 0, 0)
        return hourDate.toISOString()
    }

    const hourMap = new Map<string, { total: number, valid: number }>()
    for (const row of rows) {
        const time = row.updatedOn
        const hour = getHourKey(time)
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
            const hour = getHourKey(time)
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