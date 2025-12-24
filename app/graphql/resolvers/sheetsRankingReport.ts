import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsRankingReportArgs, RankingReport, ReportEntry } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import sheetsReportHelper from './sheetsReportHelper'
import { schemas } from '@/app/lib/schema'

export default async function sheetsRankingReport(
    _: unknown, 
    { sheetIds, schema, limit, selectionLabel }: QuerySheetsRankingReportArgs & { selectionLabel?: string }, 
    context: Context
): Promise<RankingReport> {
    const allSheets = await sheetsReportHelper(sheetIds.map(id => new ObjectId(id)), context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    const report = await generateRankingReport(sheets, limit ?? undefined, selectionLabel)

    return {
        schema,
        ...report
    }
}

async function generateRankingReport(
    sheets: WithId<Sheet>[],
    limit?: number,
    selectionLabel?: string
) {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    let rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: ""
    }).toArray()

    // Applica filtro se selectionLabel è fornito
    if (selectionLabel) {
        const schemaObj = schemas[sheets[0]?.schema]; // Assumiamo che tutti i sheets abbiano lo stesso schema
        const selection = schemaObj?.selections.find(s => s.label === selectionLabel);
        if (selection?.row_filter) {
            rows = rows.filter(row => {
                // row_filter è un oggetto con chiave-valore
                return Object.entries(selection.row_filter!).every(([key, value]) => {
                    // I dati della row sono in row.data, ma alcuni campi come classYear sono diretti?
                    // Dal codice precedente, sembra che classYear sia estratto da row.data
                    // Devo controllare come vengono estratti i campi
                    // Per ora, assumo che i campi siano in row.data
                    return row.data[key] === value;
                });
            });
        }
    }

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
        rowId: ObjectId
        selections: { label: string, selected_by: string, timestamp: Date }[]
    }> = []

    for (const row of rows) {
        const sheet = sheetMap.get(row.sheetId.toString())
        if (!sheet) continue

        // Estrai il punteggio dal campo 'score'
        const scoreValue = row.data?.score
        const score: number = parseFloat(scoreValue)

        entries.push({
            sheetId: row.sheetId,
            sheetName: sheet.name,
            studentName: row.data?.name || '',
            studentSurname: row.data?.surname || '',
            classYear: row.data?.classYear || '',
            classSection: row.data?.classSection || '',
            score,
            rowId: row._id,
            selections: row.selections || []
        })
    }

    // Ordina per punteggio decrescente
    entries.sort((a, b) => b.score - a.score)

    // Se limit è definito, prendi solo i primi 'limit', altrimenti tutti
    let rankingEntries = entries;
    if (typeof limit === 'number') {
        rankingEntries = entries.slice(0, limit);
    }
    const ranking: ReportEntry[] = rankingEntries.map((entry, index) => ({
        ...entry,
        rank: index + 1,
        sheet: sheetMap.get(entry.sheetId.toString())!
    }))

    return {
        totalStudents: entries.length,
        ranking,
    }
}
