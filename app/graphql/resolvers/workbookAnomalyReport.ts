import { Context } from '../types'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookAnomalyReportArgs, WorkbookAnomalyReport } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { get_authenticated_user } from './utils'

export default async function workbookAnomalyReport(
    _: unknown,
    { workbookId }: QueryWorkbookAnomalyReportArgs,
    context: Context
): Promise<WorkbookAnomalyReport> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const sheetsCollection = await getSheetsCollection()
    const rowsCollection = await getRowsCollection()

    // Get all sheets in the workbook that the user can access
    let sheets: WithId<Sheet>[]
    if (user.isAdmin) {
        sheets = await sheetsCollection.find({ workbookId: new ObjectId(workbookId) }).toArray()
    } else {
        sheets = await sheetsCollection.find({
            workbookId: new ObjectId(workbookId),
            $or: [
                { ownerId: user._id },
                { 'permissions.email': user.email },
                { 'permissions.userId': user._id },
            ]
        }).toArray()
    }

    const sheetIds = sheets.map(s => s._id)

    // Get all valid rows from these sheets
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: ""
    }).toArray()

    // Calculate statistics
    const statistics = calculateAnomalyStatistics(rows)

    // Calculate anomaly scores for each row
    const rowsWithScores = rows.map(row => ({
        row,
        anomalyScore: calculateAnomalyScore(row, statistics)
    }))

    // Sort by anomaly score descending
    rowsWithScores.sort((a, b) => b.anomalyScore - a.anomalyScore)

    return {
        statistics,
        outliers: rowsWithScores
    }
}

function calculateAnomalyStatistics(rows: any[]): WorkbookAnomalyReport['statistics'] {
    const nameLetters = new Map<string, number>()
    const surnameLetters = new Map<string, number>()
    const birthDates: number[] = []

    for (const row of rows) {
        const name = row.data?.name?.toString() || ''
        const surname = row.data?.surname?.toString() || ''
        const birthDateStr = row.data?.birthDate?.toString()

        // Count first letters
        if (name.length > 0) {
            const letter = name[0].toUpperCase()
            nameLetters.set(letter, (nameLetters.get(letter) || 0) + 1)
        }
        if (surname.length > 0) {
            const letter = surname[0].toUpperCase()
            surnameLetters.set(letter, (surnameLetters.get(letter) || 0) + 1)
        }

        // Collect birth dates
        if (birthDateStr) {
            const birthDate = new Date(birthDateStr).getTime()
            if (!isNaN(birthDate)) {
                birthDates.push(birthDate)
            }
        }
    }

    const nameLetterDistribution = Array.from(nameLetters.entries()).map(([letter, count]) => ({ letter, count }))
    const surnameLetterDistribution = Array.from(surnameLetters.entries()).map(([letter, count]) => ({ letter, count }))

    let birthDateStats = null
    if (birthDates.length > 0) {
        const mean = birthDates.reduce((sum, date) => sum + date, 0) / birthDates.length
        const variance = birthDates.reduce((sum, date) => sum + Math.pow(date - mean, 2), 0) / birthDates.length
        const stdDev = Math.sqrt(variance)
        const min = Math.min(...birthDates)
        const max = Math.max(...birthDates)

        birthDateStats = {
            mean,
            stdDev,
            min: new Date(min).toISOString(),
            max: new Date(max).toISOString()
        }
    }

    return {
        nameLetterDistribution,
        surnameLetterDistribution,
        birthDateStats
    }
}

function calculateAnomalyScore(row: any, statistics: WorkbookAnomalyReport['statistics']): number {
    let score = 0

    const name = row.data?.name?.toString() || ''
    const surname = row.data?.surname?.toString() || ''
    const birthDateStr = row.data?.birthDate?.toString()

    // Letter anomaly
    if (name.length > 0) {
        const letter = name[0].toUpperCase()
        const totalNames = statistics.nameLetterDistribution.reduce((sum, item) => sum + item.count, 0)
        const letterCount = statistics.nameLetterDistribution.find(item => item.letter === letter)?.count || 0
        const expected = totalNames / 26 // assuming uniform distribution
        const rarity = Math.abs(letterCount - expected) / expected
        score += rarity
    }

    if (surname.length > 0) {
        const letter = surname[0].toUpperCase()
        const totalSurnames = statistics.surnameLetterDistribution.reduce((sum, item) => sum + item.count, 0)
        const letterCount = statistics.surnameLetterDistribution.find(item => item.letter === letter)?.count || 0
        const expected = totalSurnames / 26
        const rarity = Math.abs(letterCount - expected) / expected
        score += rarity
    }

    // Birth date anomaly (z-score)
    if (birthDateStr && statistics.birthDateStats) {
        const birthDate = new Date(birthDateStr).getTime()
        if (!isNaN(birthDate)) {
            const zScore = Math.abs((birthDate - statistics.birthDateStats.mean) / statistics.birthDateStats.stdDev)
            score += zScore
        }
    }

    return score
}