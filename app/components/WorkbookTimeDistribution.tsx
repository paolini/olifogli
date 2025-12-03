'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import 'recharts-scale'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { useGetSheetsQuery, useGetSheetsTimeDistributionReportQuery, TimeDistributionReport, TimeDistributionItem } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

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

    return (
        <div className="space-y-4">
            <ResponsiveContainer width="100%" height={600}>
                <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="hourTimestamp" 
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        angle={-90}
                        textAnchor="end"
                        height={120}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(timestamp) => {
                            const date = new Date(timestamp)
                            const dd = date.getDate().toString().padStart(2, '0')
                            const hh = date.getHours().toString().padStart(2, '0')
                            return `${dd} ${hh}h`
                        }}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                        labelFormatter={(timestamp) => {
                            const date = new Date(timestamp)
                            const yy = date.getFullYear().toString().slice(-2)
                            const mm = (date.getMonth() + 1).toString().padStart(2, '0')
                            const dd = date.getDate().toString().padStart(2, '0')
                            const hh = date.getHours().toString().padStart(2, '0')
                            return `Ora: ${yy}-${mm}-${dd} ${hh}`
                        }}
                        formatter={(value: number, name: string) => [`${value}`, name]}
                    />
                    <Legend 
                        onClick={(entry) => entry.value && toggleLineVisibility(entry.value)}
                        wrapperStyle={{ cursor: 'pointer' }}
                        iconType="line"
                    />
                    <Line yAxisId="left" type="monotone" dataKey="rows" stroke="#3b82f6" strokeWidth={2} name="Righe aggiornate" hide={!visibleLines.has('Righe aggiornate')} />
                    <Line yAxisId="left" type="monotone" dataKey="validRows" stroke="#10b981" strokeWidth={2} name="Righe valide aggiornate" hide={!visibleLines.has('Righe valide aggiornate')} />
                    <Line yAxisId="left" type="monotone" dataKey="cumulativeRows" stroke="#f59e0b" strokeWidth={2} name="Cumulativo righe" hide={!visibleLines.has('Cumulativo righe')} />
                    <Line yAxisId="left" type="monotone" dataKey="cumulativeValidRows" stroke="#ef4444" strokeWidth={2} name="Cumulativo righe valide" hide={!visibleLines.has('Cumulativo righe valide')} />
                    <Line yAxisId="right" type="monotone" dataKey="closedSheets" stroke="#8b5cf6" strokeWidth={2} name="Sheet chiusi" hide={!visibleLines.has('Sheet chiusi')} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativeClosedSheets" stroke="#06b6d4" strokeWidth={2} name="Cumulativo sheet chiusi" hide={!visibleLines.has('Cumulativo sheet chiusi')} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}