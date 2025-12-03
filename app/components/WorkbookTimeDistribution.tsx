'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { useGetSheetsQuery, useGetSheetsTimeDistributionReportQuery, TimeDistributionReport, TimeDistributionItem } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

const _ = gql`
    query GetSheetsTimeDistributionReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsTimeDistributionReport(sheetIds: $sheetIds, schema: $schema) {
            schema
            timeDistribution {
                hour
                rows
                validRows
                cumulativeRows
                cumulativeValidRows
                closedSheets
                cumulativeClosedSheets
            }
        }
    }
`

export default function WorkbookTimeDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data } = useGetSheetsTimeDistributionReportQuery({
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter },
        skip: filterState?.schemaFilter === '',
        pollInterval: 10000, // millisecondi
    })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsTimeDistributionReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            {report && (
                <TimeDistributionSection key={report.schema} report={report} />
            )}
        </div>
    )
}

function TimeDistributionSection({ report }: 
    { report: TimeDistributionReport }) {
    
    const schemaName = schemas[report.schema].header

    // Stati per la visibilità delle linee (inizialmente tutte visibili)
    const [visibleLines, setVisibleLines] = useState<Set<string>>(new Set([
        'Righe aggiornate', 'Righe valide aggiornate', 'Cumulativo righe', 'Cumulativo righe valide', 'Sheet chiusi', 'Cumulativo sheet chiusi'
    ]))

    const toggleLineVisibility = (dataKey: string) => {
        setVisibleLines(prev => {
            const newSet = new Set(prev)
            if (newSet.has(dataKey)) {
                newSet.delete(dataKey)
            } else {
                newSet.add(dataKey)
            }
            return newSet
        })
    }

    // Formatta l'ora per il display
    const chartData: (TimeDistributionItem & { hourTimestamp: number })[] = report.timeDistribution.map((item) => {
        const hourTimestamp = new Date(item.hour).getTime()
        return {
            ...item,
            hourTimestamp
        }
    })

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-xl font-semibold">{schemaName} - Distribuzione Temporale</h3>
            <TimeDistributionChart 
                data={chartData}
                visibleLines={visibleLines}
                toggleLineVisibility={toggleLineVisibility}
            />
        </div>
    )
}

function TimeDistributionChart({ data, visibleLines, toggleLineVisibility }: 
    { data: (TimeDistributionItem & { hourTimestamp: number })[], visibleLines: Set<string>, toggleLineVisibility: (dataKey: string) => void }) {
    
    if (data.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    const chartData = {
        labels: data.map(item => new Date(item.hourTimestamp)),
        datasets: [
            {
                label: 'Righe aggiornate',
                data: data.map(item => item.rows),
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f6',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Righe aggiornate'),
                yAxisID: 'y',
            },
            {
                label: 'Righe valide aggiornate',
                data: data.map(item => item.validRows),
                borderColor: '#10b981',
                backgroundColor: '#10b981',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Righe valide aggiornate'),
                yAxisID: 'y',
            },
            {
                label: 'Cumulativo righe',
                data: data.map(item => item.cumulativeRows),
                borderColor: '#f59e0b',
                backgroundColor: '#f59e0b',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Cumulativo righe'),
                yAxisID: 'y',
            },
            {
                label: 'Cumulativo righe valide',
                data: data.map(item => item.cumulativeValidRows),
                borderColor: '#ef4444',
                backgroundColor: '#ef4444',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Cumulativo righe valide'),
                yAxisID: 'y',
            },
            {
                label: 'Sheet chiusi',
                data: data.map(item => item.closedSheets),
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Sheet chiusi'),
                yAxisID: 'y2',
            },
            {
                label: 'Cumulativo sheet chiusi',
                data: data.map(item => item.cumulativeClosedSheets),
                borderColor: '#06b6d4',
                backgroundColor: '#06b6d4',
                borderWidth: 2,
                tension: 0.4,
                hidden: !visibleLines.has('Cumulativo sheet chiusi'),
                yAxisID: 'y2',
            },
        ],
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick: (event: any, legendItem: any, legend: any) => {
                    toggleLineVisibility(legendItem.text)
                },
                labels: {
                    usePointStyle: true,
                },
            },
            tooltip: {
                callbacks: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    title: (context: any) => {
                        const date = new Date(context[0].parsed.x)
                        const yy = date.getFullYear().toString().slice(-2)
                        const mm = (date.getMonth() + 1).toString().padStart(2, '0')
                        const dd = date.getDate().toString().padStart(2, '0')
                        const hh = date.getHours().toString().padStart(2, '0')
                        return `Ora: ${yy}-${mm}-${dd} ${hh}`
                    },
                },
            },
        },
        scales: {
            x: {
                type: 'time' as const,
                time: {
                    unit: 'day' as const,
                },
            },
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Righe',
                },
            },
            y2: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Sheet',
                },
                grid: {
                    drawOnChartArea: false,
                },
            },
        },
    }

    return (
        <div className="space-y-4">
            <div style={{ width: '100%', height: '600px', minHeight: '600px', minWidth: '400px' }}>
                <Line data={chartData} options={options} />
            </div>
        </div>
    )
}