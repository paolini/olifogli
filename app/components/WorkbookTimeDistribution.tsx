'use client'

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
import Error from './Error'
import Loading from './Loading'
import { gql } from '@apollo/client'
import { useGetSheetsQuery, TimeDistributionReport, TimeDistributionItem, SheetState, useGetWorkbookTimeDistributionReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import { useWorkbookUpdated } from './useWorkbookUpdated'

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
    query GetWorkbookTimeDistributionReport($workbookId: ObjectId!, $schema: String, $commonData: Data, $state: SheetState) {
        workbookTimeDistributionReport(workbookId: $workbookId, schema: $schema, commonData: $commonData, state: $state) {
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
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch: refetchSheets } = useGetSheetsQuery({
        variables: { workbookId },
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data, refetch: refetchReport } = useGetWorkbookTimeDistributionReportQuery({
        variables: { workbookId, schema: filterState?.schemaFilter, commonData: filterState?.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null, state: (filterState?.statoFilter as SheetState) || null },
    })

    useWorkbookUpdated(workbookId, () => { refetchSheets(); refetchReport() })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const reports = data?.workbookTimeDistributionReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            {reports?.map(report => (
                <TimeDistributionSection key={report.schema} report={report} />
            ))}
        </div>
    )
}

function TimeDistributionSection({ report }: 
    { report: TimeDistributionReport }) {
    
    const schemaName = schemas[report.schema].header

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
            />
        </div>
    )
}

function TimeDistributionChart({ data }: 
    { data: (TimeDistributionItem & { hourTimestamp: number })[]}) {
    const tension = 0.1
    const borderWidth = 2
    
    if (data.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    const chartData = {
        labels: data.map(item => new Date(item.hourTimestamp)),
        datasets: [
            {
                label: 'Righe inserite',
                data: data.map(item => item.rows),
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f6',
                borderWidth,
                tension,
                yAxisID: 'y',
            },
            {
                label: 'Righe valide',
                data: data.map(item => item.validRows),
                borderColor: '#10b981',
                backgroundColor: '#10b981',
                borderWidth,
                tension,
                yAxisID: 'y',
            },
            {
                label: 'Fogli chiusi',
                data: data.map(item => item.closedSheets),
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                borderWidth,
                tension,
                yAxisID: 'y2',
            },
            {
                label: 'Cumulativo righe inserite',
                data: data.map(item => item.cumulativeRows),
                borderColor: '#f59e0b',
                backgroundColor: '#f59e0b',
                borderWidth,
                tension,
                yAxisID: 'y',
            },
            {
                label: 'Cumulativo righe valide',
                data: data.map(item => item.cumulativeValidRows),
                borderColor: '#ef4444',
                backgroundColor: '#ef4444',
                borderWidth,
                tension,
                yAxisID: 'y',
            },
            {
                label: 'Cumulativo fogli chiusi',
                data: data.map(item => item.cumulativeClosedSheets),
                borderColor: '#06b6d4',
                backgroundColor: '#06b6d4',
                borderWidth,
                tension,
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
                    text: 'Fogli',
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