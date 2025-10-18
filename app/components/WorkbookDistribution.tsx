'use client'

import { useState } from 'react'
import { gql, useQuery } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { WorkbookReport as WorkbookReportType } from '../graphql/generated'

const GET_WORKBOOK_REPORTS = gql`
    query GetWorkbookReports($workbookId: ObjectId!) {
        workbookReports(workbookId: $workbookId) {
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
    const { loading, error, data } = useQuery<{ workbookReports: WorkbookReportType[] }>(GET_WORKBOOK_REPORTS, {
        variables: { workbookId }
    })
    
    // Stato per il filtro dello schema - default al primo schema disponibile
    const [schemaFilter, setSchemaFilter] = useState<string>('')

    if (loading) return <Loading />
    if (error) return <Error error={error} />
    if (!data?.workbookReports || data.workbookReports.length === 0) {
        return <div className="p-4">
            <p>Nessun report disponibile. Sono necessari fogli con schema archimede-biennio o archimede-triennio.</p>
        </div>
    }

    // Imposta il filtro al primo schema se non è ancora impostato
    if (!schemaFilter && data.workbookReports.length > 0) {
        setSchemaFilter(data.workbookReports[0].schema)
    }

    // Filtra i report in base alla selezione
    const filteredReports = data.workbookReports.filter(r => r.schema === schemaFilter)

    return (
        <div className="p-4 space-y-6">
            {data.workbookReports.length > 1 && (
                <div className="flex items-center gap-3">
                    <select 
                        value={schemaFilter} 
                        onChange={e => setSchemaFilter(e.target.value)} 
                        className="border rounded px-3 py-2"
                    >
                        {data.workbookReports.map(report => (
                            <option key={report.schema} value={report.schema}>
                                {report.schema === 'archimede-biennio' ? 'Archimede Biennio' : 'Archimede Triennio'}
                            </option>
                        ))}
                    </select>
                    <span className="text-gray-600">
                        {filteredReports.length > 0 && `${filteredReports[0].totalStudents} studenti`}
                    </span>
                </div>
            )}
            {filteredReports.map(report => (
                <DistributionSection key={report.schema} report={report} />
            ))}
        </div>
    )
}

function DistributionSection({ report }: { report: WorkbookReportType }) {
    const schemaName = report.schema === 'archimede-biennio' ? 'Archimede Biennio' : 'Archimede Triennio'

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

function ScoreDistributionChart({ distribution }: { distribution: WorkbookReportType['scoreDistribution'] }) {
    if (distribution.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    // Trova il valore massimo per scalare il grafico
    const maxCount = Math.max(...distribution.map(d => d.count))
    const maxHeight = 300 // Altezza massima del grafico in pixel

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-start gap-1 h-[320px] p-4 bg-gray-50 rounded overflow-x-auto">
                {distribution.map((item) => {
                    const height = (item.count / maxCount) * maxHeight
                    return (
                        <div key={item.score} className="flex flex-col items-center" style={{ minWidth: '40px' }}>
                            <div className="text-xs text-gray-600 mb-1">{item.count}</div>
                            <div 
                                className="w-8 bg-blue-500 hover:bg-blue-600 transition-colors cursor-pointer rounded-t"
                                style={{ height: `${height}px` }}
                                title={`Punteggio ${item.score}: ${item.count} studenti`}
                            />
                            <div className="text-xs text-gray-700 mt-1 font-semibold">{item.score}</div>
                        </div>
                    )
                })}
            </div>
            <div className="text-sm text-gray-600 text-center">
                Distribuzione dei punteggi ({distribution.reduce((sum, d) => sum + d.count, 0)} studenti totali)
            </div>
        </div>
    )
}
