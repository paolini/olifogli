import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsDistributionReportArgs, DistributionReport, ScoreDistributionItem } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import sheetsReportHelper from './sheetsReportHelper'

export default async function sheetsDistributionReport(
    _: unknown, 
    { sheetIds, schema }: QuerySheetsDistributionReportArgs, 
    context: Context
): Promise<DistributionReport> {
    const allSheets = await sheetsReportHelper(sheetIds.map(id => new ObjectId(id)), context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    return {
        schema,
        ...await generateDistributionReport(sheets)
    }
}



async function generateDistributionReport(sheets: WithId<Sheet>[]) {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: ""
    }).toArray()

    // Prepara le entry con punteggio
    const scores = rows.map(row => parseFloat(row.data?.score))

    // Calcola media e varianza
    const mean = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
    const variance = scores.length > 0 ? scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length : 0

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
        scoreDistribution,
        mean,
        variance
    }
}
