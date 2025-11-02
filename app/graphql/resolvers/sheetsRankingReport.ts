import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsRankingReportArgs, RankingReport, ReportEntry } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { sheetsReportHelper } from './sheetsDistributionReport'

export default async function sheetsRankingReport(
    _: unknown, 
    { sheetIds, schema }: QuerySheetsRankingReportArgs, 
    context: Context
): Promise<RankingReport> {
    const allSheets = await sheetsReportHelper(sheetIds.map(id => new ObjectId(id)), context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    const report = await generateRankingReport(sheets)

    return {
        schema,
        ...report
    }
}

async function generateRankingReport(
    sheets: WithId<Sheet>[],
) {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: ""
    }).toArray()

    // Mappa con info dei fogli per riferimento veloce
    const sheetMap = new Map(sheets.map(s => [s._id.toString(), s]))

    // Prepara le entry con punteggio
    const entries: Array<{
        sheetId: ObjectId
        sheetName: string
        studentName: string
        studentSurname: string
        classYear: string
        classSection: string
        score: number
    }> = []

    for (const row of rows) {
        const sheet = sheetMap.get(row.sheetId.toString())
        if (!sheet) continue

        // Estrai il punteggio dal campo 'score'
        const scoreValue = row.data?.score
        let score: number = parseFloat(scoreValue)

        entries.push({
            sheetId: row.sheetId,
            sheetName: sheet.name,
            studentName: row.data?.name || '',
            studentSurname: row.data?.surname || '',
            classYear: row.data?.classYear || '',
            classSection: row.data?.classSection || '',
            score
        })
    }

    // Ordina per punteggio decrescente
    entries.sort((a, b) => b.score - a.score)

    // Prendi i primi 100 e aggiungi il rank
    const ranking: ReportEntry[] = entries.slice(0, 100).map((entry, index) => ({
        ...entry,
        rank: index + 1,
        sheet: sheetMap.get(entry.sheetId.toString())!
    }))

    return {
        totalStudents: entries.length,
        ranking,
    }
}
