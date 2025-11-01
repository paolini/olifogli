'use client'

import { useState } from 'react'
import { gql, useQuery } from '@apollo/client'
import { ObjectId } from 'bson'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Error from './Error'
import Loading from './Loading'
import { DistributionReport as DistributionReport, useGetWorkbookDistributionReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'

const _ = gql`
    query GetWorkbookDistributionReport($workbookId: ObjectId!, $schema: String!) {
        workbookDistributionReport(workbookId: $workbookId, schema: $schema) {
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
    // Stato per il filtro dello schema - default al primo schema disponibile
    const [schemaFilter, setSchemaFilter] = useState<string>('archimede_biennio')

    const { loading, error, data } = useGetWorkbookDistributionReportQuery({
        variables: { workbookId, schema: schemaFilter }
    })
    

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    // Filtra i report in base alla selezione
    const report = data?.workbookDistributionReport

    return (
        <div className="p-4 space-y-6">
            {report && (
                <div className="flex items-center gap-3">
                    <select 
                        value={schemaFilter} 
                        onChange={e => setSchemaFilter(e.target.value)} 
                        className="border rounded px-3 py-2"
                    >
                        {["archimede_biennio", "archimede_triennio"].map(schema => (
                            <option key={schema} value={schema}>
                                {schemas[schema].header}
                            </option>
                        ))}
                    </select>
                    <span className="text-gray-600">
                        {report && `${report.totalStudents} studenti`}
                    </span>
                </div>
            )}
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

    return (
        <div className="space-y-4">
            <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
            </ResponsiveContainer>
            <div className="text-sm text-gray-600 text-center">
                Distribuzione dei punteggi ({totalStudents} studenti totali)
            </div>
        </div>
    )
}
