import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookReportsArgs, WorkbookReport, ReportEntry, ScoreDistribution } from '../generated'
import { ObjectId, WithId, Document, Collection } from 'mongodb'
import { Sheet, Row } from '@/app/lib/models'

export default async function workbookReports(
    _: unknown, 
    { workbookId }: QueryWorkbookReportsArgs, 
    context: Context
): Promise<WorkbookReport[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()
    const rowsCollection = await getRowsCollection()

    // Trova tutti gli sheet del workbook con schema archimede-biennio o archimede-triennio
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
    
    // Separa per schema
    const biennioSheets = allSheets.filter(s => s.schema === 'archimede-biennio')
    const triennioSheets = allSheets.filter(s => s.schema === 'archimede-triennio')

    const reports: WorkbookReport[] = []

    // Genera report per biennio se ci sono fogli
    if (biennioSheets.length > 0) {
        const report = await generateReport('archimede-biennio', biennioSheets, rowsCollection)
        reports.push(report)
    }

    // Genera report per triennio se ci sono fogli
    if (triennioSheets.length > 0) {
        const report = await generateReport('archimede-triennio', triennioSheets, rowsCollection)
        reports.push(report)
    }

    return reports
}

async function generateReport(
    schema: string, 
    sheets: WithId<Sheet>[], 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rowsCollection: any
): Promise<WorkbookReport> {
    const sheetIds = sheets.map(s => s._id)
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds }
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
        let score: number = 0
        
        if (typeof scoreValue === 'number') {
            score = scoreValue
        } else if (typeof scoreValue === 'string') {
            const parsed = parseFloat(scoreValue)
            if (!isNaN(parsed)) {
                score = parsed
            }
        }

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
    const top100: ReportEntry[] = entries.slice(0, 100).map((entry, index) => ({
        ...entry,
        rank: index + 1
    }))

    // Calcola la distribuzione dei punteggi
    const scoreMap = new Map<number, number>()
    for (const entry of entries) {
        // Arrotonda il punteggio all'intero più vicino per aggregare
        const roundedScore = Math.round(entry.score)
        scoreMap.set(roundedScore, (scoreMap.get(roundedScore) || 0) + 1)
    }

    // Converti in array e ordina per punteggio
    const scoreDistribution: ScoreDistribution[] = Array.from(scoreMap.entries())
        .map(([score, count]) => ({ score, count }))
        .sort((a, b) => a.score - b.score)

    return {
        schema,
        totalStudents: entries.length,
        top100,
        scoreDistribution
    }
}
