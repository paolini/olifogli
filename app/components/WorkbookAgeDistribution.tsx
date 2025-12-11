'use client'

import { gql, useQuery } from '@apollo/client'
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
import { Chart } from 'react-chartjs-2'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { useGetSheetsQuery } from '../graphql/generated'
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

const GET_SHEETS_AGE_DISTRIBUTION_REPORT = gql`
    query GetSheetsAgeDistributionReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsAgeDistributionReport(sheetIds: $sheetIds, schema: $schema) {
            items {
                age
                rows
            }
            totalRows
            mean
            variance
        }
    }
`

export default function WorkbookAgeDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading: loadingSheets, error: sheetsError, data: sheetsData } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data } = useQuery(GET_SHEETS_AGE_DISTRIBUTION_REPORT, {
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter },
        skip: filterState?.schemaFilter === '',
        pollInterval: 10000, // millisecondi
    })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsAgeDistributionReport

    if (!report) return <div>Nessun dato disponibile</div>

    const labels = report.items.map((item: { age: number; rows: number }) => item.age.toString())
    const counts = report.items.map((item: { age: number; rows: number }) => item.rows)

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Studenti',
                data: counts,
                backgroundColor: '#3b82f6',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 8,
            },
        ],
    }

    const options = {
        responsive: true,
        maintainAspectRatio: true,
        height: 600,
        plugins: {
            legend: {
                display: true,
            },
            tooltip: {
                callbacks: {
                    // @ts-expect-error Chart.js tooltip context type
                    label: (context) => `${context.parsed.y} studenti`,
                    // @ts-expect-error Chart.js tooltip context type
                    title: (context) => `Età: ${context[0].label}`,
                },
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Età',
                },
            },
            y: {
                title: {
                    display: true,
                    text: 'Numero di studenti',
                },
                beginAtZero: true,
            },
        },
    }

    return (
        <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold">Distribuzione per età</h3>
                    <div className="text-gray-600 text-right">
                        <div>Totale studenti: {report.totalRows}</div>
                        {report.mean !== null && report.mean !== undefined && (
                            <div>μ: {report.mean.toFixed(1)} anni</div>
                        )}
                        {report.variance !== null && report.variance !== undefined && (
                            <div>σ: {Math.sqrt(report.variance).toFixed(1)} anni</div>
                        )}
                    </div>
                </div>
                <Chart type="bar" data={chartData} options={options} />
            </div>
        </div>
    )
}
