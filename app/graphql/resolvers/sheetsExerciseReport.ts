import { Context } from '../types'
import { get_authenticated_user } from './utils'
import { getSheetsCollection, getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsExerciseReportArgs, ExerciseReport, ExerciseDistributionItem } from '../generated'
import { ObjectId, WithId, Document } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { schemas } from '@/app/lib/schema'
import { ChoiceAnswerField } from '@/app/lib/schema/fields'

export default async function sheetsExerciseReport(
    _: unknown, 
    { sheetIds, schema }: QuerySheetsExerciseReportArgs, 
    context: Context
): Promise<ExerciseReport> {
    const allSheets = await sheetsReportHelper(sheetIds, context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    return {
        schema,
        ...await generateExerciseReport(sheets, schema)
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


async function generateExerciseReport(sheets: WithId<Sheet>[], schema: string): Promise<{totalStudents: number, exerciseDistribution: ExerciseDistributionItem[]}> {
    const rowsCollection = await getRowsCollection()
    const sheetIds = sheets.map(s => s._id)
    const theSchema = schemas[schema]
    if (!theSchema) {
        throw new Error(`Schema non supportato: ${schema}`)
    }

    const fields = theSchema.fields.filter(f => f instanceof ChoiceAnswerField) as ChoiceAnswerField[]

    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: ""
    }).toArray()

    // Prepara le entry con conteggi per esercizio
    const exerciseCounts = new Map<string, {correct: number, wrong: number, empty: number, invalid: number}>()
    for (const field of fields) {
        exerciseCounts.set(field.name, {correct: 0, wrong: 0, empty: 0, invalid: 0})
    }

    for (const row of rows) {
        for (const field of fields) {
            const counts = exerciseCounts.get(field.name)!
            const value = row.data[field.name] || ''

            // "X [YZW]"
            if (!value || value.length < 7 || value.charAt(2) !== '[' || value.charAt(6) !== ']') {
                counts.invalid++
                continue // formato non valido
            }
            const given = value.charAt(4) // Z
            const correct = value.charAt(5) // W

            if (given === '-') {
                counts.empty++
            } else if (!/[A-Z]/.test(given)) {
                counts.invalid++
            } else if (given === correct) {
                counts.correct++
            } else {
                counts.wrong++
            }
        }
    }

    // Converti in array
    const exerciseDistribution: ExerciseDistributionItem[] = Array.from(exerciseCounts.entries())
        .map(([exercise, counts]) => ({ exercise, ...counts }))
        .sort((a, b) => a.exercise.localeCompare(b.exercise))

    return {
        totalStudents: rows.length,
        exerciseDistribution
    }
}