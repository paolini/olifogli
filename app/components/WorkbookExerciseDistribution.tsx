'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { useGetSheetsQuery, useGetSheetsExerciseReportQuery, ExerciseReport } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

const CHOICE_LABELS = {
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
    E: 'E'
}

const CORRECTNESS_LABELS = {
    correct: 'giuste',
    wrong: 'sbagliate',
    empty: 'vuote',
    invalid: 'nulle'
}

const _ = gql`
    query GetSheetsExerciseReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsExerciseReport(sheetIds: $sheetIds, schema: $schema) {
            schema
            totalStudents
            exerciseDistribution {
                exercise
                correct
                wrong
                empty
                invalid
                A
                B
                C
                D
                E
            }
        }
    }
`

export default function WorkbookExerciseDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data } = useGetSheetsExerciseReportQuery({
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter },
        skip: filterState?.schemaFilter === '',
        pollInterval: 10000, // millisecondi
    })

    const [viewMode, setViewMode] = useState<'choices' | 'correctness'>('correctness')

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsExerciseReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            <label className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    checked={viewMode === 'choices'}
                    onChange={e => setViewMode(e.target.checked ? 'choices' : 'correctness')}
                />
                <span>mostra distrattori</span>
            </label>
            {report && (
                <ExerciseDistributionSection key={report.schema} report={report} viewMode={viewMode} />
            )}
        </div>
    )
}

function ExerciseDistributionSection({ report, viewMode }: { report: ExerciseReport, viewMode: 'choices' | 'correctness' }) {
    const schemaName = schemas[report.schema].header

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName} - Distribuzione per Esercizio</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <ExerciseDistributionChart distribution={report.exerciseDistribution} viewMode={viewMode} totalStudents={report.totalStudents} />
        </div>
    )
}

function ExerciseDistributionChart({ distribution, viewMode, totalStudents }: { distribution: ExerciseReport['exerciseDistribution'], viewMode: 'choices' | 'correctness', totalStudents: number }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    const labels = viewMode === 'choices' ? CHOICE_LABELS : CORRECTNESS_LABELS

    // Trasforma i dati nel formato richiesto da Recharts
    const chartData = distribution.map(item => ({
        exercise: item.exercise,
        A: item.A,
        B: item.B,
        C: item.C,
        D: item.D,
        E: item.E,
        correct: item.correct,
        wrong: item.wrong,
        empty: item.empty,
        invalid: item.invalid
    }))

    const numExercises = distribution.length
    const chartWidth = Math.min(Math.max(numExercises * 60 + 100, 400), 1200)

    return (
        <div className="space-y-4">
            <BarChart width={chartWidth} height={400} data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                    dataKey="exercise" 
                    label={{ value: 'Esercizio', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                    label={{ value: 'Numero di risposte', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                    formatter={(value: number, name: string) => {
                        const percentage = ((value / totalStudents) * 100).toFixed(1)
                        return [`${value} risposte (${percentage}%)`, labels[name as keyof typeof labels] || name]
                    }}
                    labelFormatter={(label) => `Esercizio ${label}`}
                />
                <Legend />
                {viewMode === 'choices' ? (
                    <>
                        <Bar dataKey="A" stackId="a" fill="#4f2a0aff" name={CHOICE_LABELS.A} />
                        <Bar dataKey="B" stackId="a" fill="#3b82f6" name={CHOICE_LABELS.B} />
                        <Bar dataKey="C" stackId="a" fill="#ef4444" name={CHOICE_LABELS.C} />
                        <Bar dataKey="D" stackId="a" fill="#f59e0b" name={CHOICE_LABELS.D} />
                        <Bar dataKey="E" stackId="a" fill="#8b5cf6" name={CHOICE_LABELS.E} />                        
                        <Bar dataKey="correct" stackId="a" fill="#10b981" name={CORRECTNESS_LABELS.correct} />
                        <Bar dataKey="empty" stackId="a" fill="#6b7280" name={CORRECTNESS_LABELS.empty} />
                        <Bar dataKey="invalid" stackId="a" fill="#f59e0b" name={CORRECTNESS_LABELS.invalid} />
                    </>
                ) : (
                    <>
                        <Bar dataKey="correct" stackId="a" fill="#10b981" name={CORRECTNESS_LABELS.correct} />
                        <Bar dataKey="wrong" stackId="a" fill="#ef4444" name={CORRECTNESS_LABELS.wrong} />
                        <Bar dataKey="empty" stackId="a" fill="#6b7280" name={CORRECTNESS_LABELS.empty} />
                        <Bar dataKey="invalid" stackId="a" fill="#f59e0b" name={CORRECTNESS_LABELS.invalid} />
                    </>
                )}
            </BarChart>
        </div>
    )
}