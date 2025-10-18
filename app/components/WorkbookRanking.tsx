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
            top100 {
                sheetId
                sheetName
                studentName
                studentSurname
                classYear
                classSection
                score
                rank
            }
        }
    }
`

export default function WorkbookRanking({ workbookId }: { workbookId: ObjectId }) {
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
                <RankingSection key={report.schema} report={report} />
            ))}
        </div>
    )
}

function RankingSection({ report }: { report: WorkbookReportType }) {
    const schemaName = report.schema === 'archimede-biennio' ? 'Archimede Biennio' : 'Archimede Triennio'

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <TopRanking top100={report.top100} />
        </div>
    )
}

function TopRanking({ top100 }: { top100: WorkbookReportType['top100'] }) {
    if (top100.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border p-2 text-left">Pos.</th>
                        <th className="border p-2 text-left">Cognome</th>
                        <th className="border p-2 text-left">Nome</th>
                        <th className="border p-2 text-left">Classe</th>
                        <th className="border p-2 text-left">Sezione</th>
                        <th className="border p-2 text-left">Foglio</th>
                        <th className="border p-2 text-right">Punteggio</th>
                    </tr>
                </thead>
                <tbody>
                    {top100.map((entry) => (
                        <tr key={`${entry.sheetId}-${entry.rank}`} className="hover:bg-gray-50">
                            <td className="border p-2 font-semibold">{entry.rank}</td>
                            <td className="border p-2">{entry.studentSurname}</td>
                            <td className="border p-2">{entry.studentName}</td>
                            <td className="border p-2">{entry.classYear}</td>
                            <td className="border p-2">{entry.classSection}</td>
                            <td className="border p-2 text-sm text-gray-600">{entry.sheetName}</td>
                            <td className="border p-2 text-right font-semibold">{entry.score.toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
