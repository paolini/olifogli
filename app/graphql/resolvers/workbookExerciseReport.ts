import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookExerciseReportArgs, ExerciseReport, ExerciseDistributionItem } from '../generated'
import { WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { schemas } from '@/app/lib/schema'
import { AnswerField, ChoiceAnswerField } from '@/app/lib/schema/fields'
import { getAllSheets } from './sheetsReportHelper'
import { ObjectId } from 'bson'
import Competition from '@/app/lib/schema/Competition'

export default async function workbookExerciseReport(
    _: unknown, 
    { workbookId, schema, commonData, state }: QueryWorkbookExerciseReportArgs, 
    context: Context
): Promise<ExerciseReport[]> {
    const allSheets = await getAllSheets(new ObjectId(workbookId), schema || null, commonData || {}, state || '', context)
    const allSchemas = Array.from(new Set(allSheets.map(s => s.schema)))

    const reports: ExerciseReport[] = []

    for (const schema of allSchemas) {  
        const theSchema = schemas[schema]
        if (!theSchema) continue
        if (!(theSchema instanceof Competition)) continue
        const sheets = allSheets.filter(s => s.schema === schema)
        reports.push({
            schema,
            ...await generateExerciseReport(sheets, schema)
        })
    }

    return reports
}

async function generateExerciseReport(sheets: WithId<Sheet>[], schema: string): Promise<{totalStudents: number, exerciseDistribution: ExerciseDistributionItem[]}> {
    const rowsCollection = await getRowsCollection()
    const sheetIds = sheets.map(s => s._id)
    const theSchema = schemas[schema]
    if (!theSchema) {
        throw new Error(`Schema non supportato: ${schema}`)
    }

    const fields = theSchema.fields.filter(f => f instanceof AnswerField) as AnswerField[]

    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds },
        error: "", // righe valide
        "data.score": { $exists: true, $ne: "" } // togli studenti assenti
    }).toArray()

    type Counts = {
        correct: number;
        wrong: number;
        empty: number;
        invalid: number;
        correct_answer: string;
        answers: Record<string, number>; // conteggio per ogni risposta data (es. A, B, C, D, E)
    }

    // Prepara le entry con conteggi per esercizio
    const exerciseCounts = new Map<string, Counts>()
    for (const field of fields) {
        exerciseCounts.set(field.name, {
            correct: 0, wrong: 0, empty: 0, invalid: 0, 
            correct_answer: '',
            answers: {}})
    }

    for (const row of rows) {
        for (const field of fields) {
            const counts = exerciseCounts.get(field.name)!
            const value = row.data[field.name] || ''

            let given = value
            let correct = ""

            const m = value.match(/^(.*)\s\[(.*)\]$/)
            if (m) {
                // "<given> [<correct>]"
                given = m[1]
                correct = m[2]
                if (field instanceof ChoiceAnswerField && correct.length===3) {
                    // "X [YZW]"
                    given = correct[1] // Z
                    correct = correct[2] // W
                }
            }

            if (counts.correct_answer === '') {
                counts.correct_answer = correct
            } else if (counts.correct_answer !== correct) {
                console.warn(`    Warning: different correct answers found for field ${field.name}: "${counts.correct_answer}" vs "${correct}"`)
            }

            if (given !== correct) {
                counts.answers[given] = (counts.answers[given] || 0) + 1
            }

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
        .map(([exercise, item]) => (
            { exercise, 
                correct: item.correct,
                wrong: item.wrong,
                empty: item.empty,
                invalid: item.invalid,
                correct_answer: item.correct_answer,
                answers: Object.entries(item.answers).map(([answer, count]) => ({ 
                    answer, 
                    count 
                }))
             }))
        .sort((a, b) => a.exercise.localeCompare(b.exercise))

    return {
        totalStudents: rows.length,
        exerciseDistribution
    }
}