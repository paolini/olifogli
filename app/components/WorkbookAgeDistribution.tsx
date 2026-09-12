'use client'

import { gql } from '@apollo/client'
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
import Error from './Error'
import Loading from './Loading'
import { AgeDistributionReport, SheetState, useGetSheetsQuery, useGetWorkbookAgeDistributionReportQuery } from '../graphql/generated'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import { useWorkbookUpdated } from './useWorkbookUpdated'
import { schemas } from '../lib/schema'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const _ = gql`
    query GetWorkbookAgeDistributionReport($workbookId: ObjectId!, $schema: String, $commonData: Data, $state: SheetState) {
        workbookAgeDistributionReport(workbookId: $workbookId, schema: $schema, commonData: $commonData, state: $state) {
            schema
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
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch: refetchSheets } = useGetSheetsQuery({
        variables: { workbookId },
    })
    const { filterState } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data, refetch: refetchReport } = useGetWorkbookAgeDistributionReportQuery({
        variables: { workbookId, schema: filterState?.schemaFilter, commonData: filterState?.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null, state: (filterState?.statoFilter as SheetState) || null },
    })

    useWorkbookUpdated(workbookId, () => { refetchSheets(); refetchReport() })

    if (loading || loadingSheets) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const reports = data?.workbookAgeDistributionReport

    if (reports?.length === 0) return <div>Nessun dato disponibile</div>

    return <div className="p-4 space-y-6" style={{ width: 'fit-content', maxWidth: '100%' }}>
        <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
        {reports?.map(report => (
            <AgeDistributionSection key={report.schema} report={report} viewMode={'summary'} />
        ))}
    </div>
}

function AgeDistributionSection({ report, viewMode }: { report: AgeDistributionReport, viewMode: 'summary' | 'distractors' }) {
    const labels = report.items.map((item: { age: number; rows: number }) => item.age.toString())
    const counts = report.items.map((item: { age: number; rows: number }) => item.rows)
    const schema = schemas[report.schema];

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

    return <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Distribuzione per età - {schema.header}</h3>
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
}
