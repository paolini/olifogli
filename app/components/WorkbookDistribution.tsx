'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { DistributionReport as DistributionReport, useGetSheetsQuery, useGetSheetsDistributionReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import { zhCN } from 'date-fns/locale'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
)

const _ = gql`
    query GetSheetsDistributionReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsDistributionReport(sheetIds: $sheetIds, schema: $schema) {
            schema
            totalStudents
            scoreDistribution {
                score
                count
            }
            mean
            variance
        }
    }
`

export default function WorkbookDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const [useBinning, setUseBinning] = useState(false)

    const { loading, error, data } = useGetSheetsDistributionReportQuery({
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter },
        skip: filterState?.schemaFilter === '',
        pollInterval: 10000, // millisecondi
    })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsDistributionReport

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        checked={useBinning}
                        onChange={e => setUseBinning(e.target.checked)}
                    />
                    <span>Raggruppa punteggi</span>
                </label>
            </div>
            {report && (
                <DistributionSection key={report.schema} report={report} useBinning={useBinning} />
            )}
        </div>
    )
}

function DistributionSection({ report, useBinning }: { report: DistributionReport, useBinning: boolean }) {
    const schemaName = schemas[report.schema].header

    let processedDistribution = report.scoreDistribution
    if (useBinning) {
        const binMap = new Map<number, number>()
        for (const item of report.scoreDistribution) {
            const bin = Math.floor(item.score / 5) * 5
            binMap.set(bin, (binMap.get(bin) || 0) + item.count)
        }
        processedDistribution = Array.from(binMap.entries()).map(([score, count]) => ({ score, count })).sort((a, b) => a.score - b.score)
    }

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <div className="text-gray-600 text-right">
                    <div>Totale studenti: {report.totalStudents}</div>
                    {report.mean !== null && report.mean !== undefined && (
                        <div>μ: {report.mean.toFixed(2)}</div>
                    )}
                    {report.variance !== null && report.variance !== undefined && (
                        <div>σ: {Math.sqrt(report.variance).toFixed(2)}</div>
                    )}
                </div>
            </div>

            <ScoreDistributionChart distribution={processedDistribution} />
        </div>
    )
}

function ScoreDistributionChart({ distribution }: { distribution: DistributionReport['scoreDistribution'] }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    // Trasforma i dati nel formato richiesto da Chart.js
    const labels = distribution.map(item => item.score.toString())
    const studentData = distribution.map(item => item.count)

    const totalStudents = distribution.reduce((sum, d) => sum + d.count, 0)

    // Calcola la cumulativa: percentuale di studenti con punteggio <= corrente
    let cum = 0
    const percentileData = distribution.map(item => {
        cum += item.count
        return (cum / totalStudents) * 100
    })

    const datasets = [
        {
            type: 'line' as const,
            label: 'Percentile',
            data: percentileData,
            borderColor: '#ff7300',
            backgroundColor: '#ff7300',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y2',
            tension: 0.1,
        },        
        {
            type: 'bar' as const,
            label: 'Studenti',
            data: studentData,
            backgroundColor: '#3b82f6',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 8,
            yAxisID: 'y',
        },
    ]

    const chartData = {
        labels,
        datasets,
    }

    // Calcola la larghezza in base al numero di barre
    const numBars = distribution.length
    const chartWidth = Math.min(Math.max(numBars * 30 + 100, 400), 1200)

    const options = {
        responsive: true,
        maintainAspectRatio: true,
        //width: chartWidth,
        height: 1200,
        plugins: {
            legend: {
                display: true,
            },
            tooltip: {
                callbacks: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label: (context: any) => {
                        if (context.dataset.type === 'bar') {
                            return `${context.parsed.y} studenti`
                        } else {
                            return `${context.parsed.y.toFixed(1)}% percentile`
                        }
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    title: (context: any) => {
                        return `Punteggio: ${context[0].label}`
                    },
                },
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Punteggio',
                },
            },
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: {
                    display: true,
                    text: 'Numero di studenti',
                },
                beginAtZero: true,
            },
            y2:{
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: {
                    display: true,
                    text: 'Percentile (%)',
                },
                beginAtZero: true,
                grid: {
                    drawOnChartArea: false,
                },
            },
        },
    }

    return (
        <div className="space-y-4">
            <div>
                <Chart type="bar" data={chartData} options={options} />
            </div>
        </div>
    )
}
