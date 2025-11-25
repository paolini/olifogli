'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Error from './Error'
import Loading from './Loading'
import { DistributionReport as DistributionReport, useGetSheetsQuery, useGetSheetsDistributionReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

const _ = gql`
    query GetSheetsDistributionReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsDistributionReport(sheetIds: $sheetIds, schema: $schema) {
            schema
            totalStudents
            scoreDistribution {
                score
                count
            }
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
            {report && (
                <DistributionSection key={report.schema} report={report} />
            )}
        </div>
    )
}

function DistributionSection({ report }: { report: DistributionReport }) {
    const schemaName = schemas[report.schema].header

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <ScoreDistributionChart distribution={report.scoreDistribution} />
        </div>
    )
}

function ScoreDistributionChart({ distribution }: { distribution: DistributionReport['scoreDistribution'] }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    // Trasforma i dati nel formato richiesto da Recharts
    const chartData = distribution.map(item => ({
        punteggio: item.score,
        studenti: item.count
    }))

    const totalStudents = distribution.reduce((sum, d) => sum + d.count, 0)

    // Calcola la larghezza in base al numero di barre
    // Minimo 400px, massimo 1200px, circa 30px per barra
    const numBars = distribution.length
    const chartWidth = Math.min(Math.max(numBars * 30 + 100, 400), 1200)

    return (
        <div className="space-y-4">
            <BarChart width={chartWidth} height={400} data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                    dataKey="punteggio" 
                    label={{ value: 'Punteggio', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                    label={{ value: 'Numero di studenti', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                    formatter={(value: number) => [`${value} studenti`, 'Frequenza']}
                    labelFormatter={(label) => `Punteggio: ${label}`}
                />
                <Legend />
                <Bar 
                    dataKey="studenti" 
                    fill="#3b82f6" 
                    name="Studenti"
                    radius={[8, 8, 0, 0]}
                />
            </BarChart>
        </div>
    )
}
