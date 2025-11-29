'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Error from './Error'
import Loading from './Loading'
import { useGetSheetsQuery, useGetSheetsExerciseReportQuery, ExerciseReport } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

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

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsExerciseReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            {report && (
                <ExerciseDistributionSection key={report.schema} report={report} />
            )}
        </div>
    )
}

function ExerciseDistributionSection({ report }: { report: ExerciseReport }) {
    const schemaName = schemas[report.schema].header

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName} - Distribuzione per Esercizio</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <ExerciseDistributionChart distribution={report.exerciseDistribution} />
        </div>
    )
}

function ExerciseDistributionChart({ distribution }: { distribution: ExerciseReport['exerciseDistribution'] }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    // Trasforma i dati nel formato richiesto da Recharts
    const chartData = distribution.map(item => ({
        esercizio: item.exercise,
        corrette: item.correct,
        sbagliate: item.wrong,
        vuote: item.empty,
        invalide: item.invalid
    }))

    const numExercises = distribution.length
    const chartWidth = Math.min(Math.max(numExercises * 60 + 100, 400), 1200)

    return (
        <div className="space-y-4">
            <BarChart width={chartWidth} height={400} data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                    dataKey="esercizio" 
                    label={{ value: 'Esercizio', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                    label={{ value: 'Numero di risposte', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                    formatter={(value: number, name: string) => {
                        const labels = {
                            corrette: 'Corrette',
                            sbagliate: 'Sbagliate',
                            vuote: 'Vuote',
                            invalide: 'Invalide'
                        }
                        return [`${value} risposte`, labels[name as keyof typeof labels] || name]
                    }}
                    labelFormatter={(label) => `Esercizio ${label}`}
                />
                <Legend />
                <Bar dataKey="corrette" stackId="a" fill="#10b981" name="Corrette" />
                <Bar dataKey="sbagliate" stackId="a" fill="#ef4444" name="Sbagliate" />
                <Bar dataKey="vuote" stackId="a" fill="#6b7280" name="Vuote" />
                <Bar dataKey="invalide" stackId="a" fill="#f59e0b" name="Invalide" />
            </BarChart>
        </div>
    )
}