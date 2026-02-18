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
                correct_answer
                answers {
                    answer
                    count
                }
            }
        }
    }
`

export default function WorkbookExerciseDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const { filterState } = useSheetsFilterWithQuerystring({})
    const sheets = (sheetsData?.sheets || [])
        // .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data } = useGetWorkbookExerciseReportQuery({
        variables: { workbookId, schema: filterState?.schemaFilter || null, commonData: filterState?.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null, state: (filterState?.statoFilter as SheetState) || null },
        pollInterval: 10000, // millisecondi
    })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const reports = data?.workbookExerciseReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            {reports?.map(report => (
                <ExerciseDistributionSection key={report.schema} report={report} />
            ))}
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
            <ExerciseDistributionChart distribution={report.exerciseDistribution} totalStudents={report.totalStudents} />
            {
                report.exerciseDistribution.map(item => (
                    <div key={item.exercise} className="text-sm">
                        <strong>Esercizio {item.exercise}: </strong> 
                            {item.correct} giuste, {}
                            {item.wrong} sbagliate, {}
                            {item.empty} vuote, {}
                            {item.invalid} nulle {}
                            <AnswerDistributionChart item={item} />
                    </div>
                ))
            }
        </div>
    )
}

function ExerciseDistributionChart({ distribution, totalStudents }: { distribution: ExerciseReport['exerciseDistribution'], totalStudents: number }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    const numExercises = distribution.length
    const chartWidth = Math.min(Math.max(numExercises * 60 + 100, 400), 1200)

    // Prepare data for Chart.js
    const labels = distribution.map(item => item.exercise.toString())
    
    const answers = Array.from(new Set(distribution.flatMap(item => item.answers.map(a => a.answer)))).sort()

    // console.log(`Unique answers across distribution:`, answers.sort())

    const datasets = [
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
                        const total = item.correct + item.wrong + item.empty + item.invalid
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

    console.log(`Chart data:`, chartData)

    return (
        <div className="space-y-4">
            <Bar data={chartData} options={options} width={chartWidth} height={400} />
        </div>
    )
}

function AnswerDistributionChart({ item }: { item: ExerciseReport['exerciseDistribution'][0] }) {
    if (item.answers.length === 0) {
        return null
    }

    // Le risposte sono già ordinate server-side usando field.cmp()
    const answers = item.answers

    const labels = answers.map(a => {
        const answer = a.answer
        if (answer === '' || answer === '-') return 'bianca'
        return answer
    })

    const data = answers.map(a => a.count)

    const chartData = {
        labels: labels as string[],
        datasets: [
            {
                label: 'Risposte sbagliate',
                data: data,
                backgroundColor: '#3b82f6',
                borderColor: '#2563eb',
                borderWidth: 1
            }
        ]
    }

    const options = {
        responsive: true,
        plugins: {
            legend: {
                display: false
            },
            title: {
                display: false
            },
            tooltip: {
                callbacks: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label: function(context: any) {
                        const value = context.parsed.y
                        const percentage = item.correct + item.wrong + item.empty + item.invalid > 0 ? ((value / (item.correct + item.wrong + item.empty + item.invalid)) * 100).toFixed(1) : '0.0'
                        return `${context.dataset.label}: ${value} risposte (${percentage}%)`
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Risposta'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Conteggio'
                },
                beginAtZero: true
            }
        }
    }

    return (
        <div className="mt-2" style={{ maxWidth: '400px' }}>
            <Bar data={chartData} options={options} />
        </div>
    )
}