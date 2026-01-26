'use client'

import { ObjectId } from 'bson'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { gql } from '@apollo/client'
import { useGetSheetsQuery, ExerciseReport, useGetWorkbookExerciseReportQuery, SheetState } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

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
    query GetWorkbookExerciseReport($workbookId: ObjectId!, $schema: String, $commonData: Data, $state: SheetState) {
        workbookExerciseReport(workbookId: $workbookId, schema: $schema, commonData: $commonData, state: $state) {
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

    const { loading, error, data } = useGetWorkbookExerciseReportQuery({
        variables: { workbookId, schema: filterState?.schemaFilter || null, commonData: filterState?.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null, state: (filterState?.statoFilter as SheetState) || null },
        pollInterval: 10000, // millisecondi
    })

    const [viewMode, setViewMode] = useState<'choices' | 'correctness'>('correctness')

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const reports = data?.workbookExerciseReport

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
            {reports?.map(report => (
                <ExerciseDistributionSection key={report.schema} report={report} viewMode={viewMode} />
            ))}
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

    const numExercises = distribution.length
    const chartWidth = Math.min(Math.max(numExercises * 60 + 100, 400), 1200)

    // Prepare data for Chart.js
    const labels = distribution.map(item => item.exercise.toString())
    
    const datasets = viewMode === 'choices' ? [
        {
            label: CHOICE_LABELS.A,
            data: distribution.map(item => item.A),
            backgroundColor: '#4f2a0aff',
            stack: 'stack1'
        },
        {
            label: CHOICE_LABELS.B,
            data: distribution.map(item => item.B),
            backgroundColor: '#3b82f6',
            stack: 'stack1'
        },
        {
            label: CHOICE_LABELS.C,
            data: distribution.map(item => item.C),
            backgroundColor: '#ef4444',
            stack: 'stack1'
        },
        {
            label: CHOICE_LABELS.D,
            data: distribution.map(item => item.D),
            backgroundColor: '#f59e0b',
            stack: 'stack1'
        },
        {
            label: CHOICE_LABELS.E,
            data: distribution.map(item => item.E),
            backgroundColor: '#8b5cf6',
            stack: 'stack1'
        },
        {
            label: CORRECTNESS_LABELS.correct,
            data: distribution.map(item => item.correct),
            backgroundColor: '#10b981',
            stack: 'stack1'
        },
       {
            label: CORRECTNESS_LABELS.empty,
            data: distribution.map(item => item.empty),
            backgroundColor: '#6b7280',
            stack: 'stack1'
        },
        {
            label: CORRECTNESS_LABELS.invalid,
            data: distribution.map(item => item.invalid),
            backgroundColor: '#000000ff',
            stack: 'stack1'
        }

    ] : [
        {
            label: CORRECTNESS_LABELS.correct,
            data: distribution.map(item => item.correct),
            backgroundColor: '#10b981',
            stack: 'stack1'
        },
        {
            label: CORRECTNESS_LABELS.wrong,
            data: distribution.map(item => item.wrong),
            backgroundColor: '#ef4444',
            stack: 'stack1'
        },
        {
            label: CORRECTNESS_LABELS.empty,
            data: distribution.map(item => item.empty),
            backgroundColor: '#6b7280',
            stack: 'stack1'
        },
        {
            label: CORRECTNESS_LABELS.invalid,
            data: distribution.map(item => item.invalid),
            backgroundColor: '#000000ff',
            stack: 'stack1'
        }
    ]

    const chartData = {
        labels,
        datasets
    }

    const options = {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label: function(context: any) {
                        const value = context.parsed.y
                        const item = distribution[context.dataIndex]
                        const total = viewMode === 'choices' 
                            ? item.A + item.B + item.C + item.D + item.E
                            : item.correct + item.wrong + item.empty + item.invalid
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
                        return `${context.dataset.label}: ${value} risposte (${percentage}%)`
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    title: function(context: any) {
                        return `Esercizio ${context[0].label}`
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Esercizio'
                },
                stacked: true
            },
            y: {
                title: {
                    display: true,
                    text: 'Numero di risposte'
                },
                stacked: true
            }
        }
    }

    return (
        <div className="space-y-4">
            <Bar data={chartData} options={options} width={chartWidth} height={400} />
        </div>
    )
}