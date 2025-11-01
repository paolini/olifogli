import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookDistributionReportArgs, DistributionReport, ReportEntry, ScoreDistributionItem } from '../generated'
import { ObjectId, WithId, Document } from 'mongodb'
import { Sheet } from '@/app/lib/models'

export default async function workbookDistributionReport(
    _: unknown, 
    { workbookId, schema }: QueryWorkbookDistributionReportArgs, 
    context: Context
): Promise<DistributionReport> {
    const allSheets = await workbookReportHelper(workbookId, context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    return {
        schema,
        ...await generateDistributionReport(sheets)
    }
}

export async function workbookReportHelper(
    workbookId: ObjectId, 
    context: Context
): Promise<Sheet[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()

    // Trova tutti gli sheet del workbook con schema archimede_biennio o archimede_triennio
    // a cui l'utente ha accesso
    const sheetFilter: Document = { workbookId }
    
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


async function generateDistributionReport(sheets: WithId<Sheet>[]) {
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
    const scores = rows.map(row => parseFloat(row.data?.score))

    // Ordina per punteggio decrescente
    scores.sort((a, b) => b - a)

    // Calcola la distribuzione dei punteggi
    const scoreMap = new Map<number, number>()
    for (const score of scores) {
        // Arrotonda il punteggio all'intero più vicino per aggregare
        const roundedScore = Math.round(score)
        scoreMap.set(roundedScore, (scoreMap.get(roundedScore) || 0) + 1)
    }

    // Converti in array e ordina per punteggio
    const scoreDistribution: ScoreDistributionItem[] = Array.from(scoreMap.entries())
        .map(([score, count]) => ({ score, count }))
        .sort((a, b) => a.score - b.score)

    return {
        totalStudents: scores.length,
        scoreDistribution
    }
}
