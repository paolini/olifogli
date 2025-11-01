'use client'

import { useState } from 'react'
import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { RankingReport, useGetWorkbookRankingReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'

const _ = gql`
    query GetWorkbookRankingReport($workbookId: ObjectId!, $schema: String!) {
        workbookRankingReport(workbookId: $workbookId, schema: $schema) {
            schema
            totalStudents
            ranking {
                sheetId
                sheetName
                studentName
                studentSurname
                classYear
                classSection
                score
                rank
                sheet {
                    commonData
                }
            }
        }
    }
`

export default function WorkbookRanking({ workbookId }: { workbookId: ObjectId }) {
    // Stato per il filtro dello schema - default al primo schema disponibile
    const [schemaFilter, setSchemaFilter] = useState<string>('archimede_biennio')

    const { loading, error, data } = useGetWorkbookRankingReportQuery({
        variables: { workbookId, schema: schemaFilter },
    })
    
    if (loading) return <Loading />
    if (error) return <Error error={error} />

    // Filtra i report in base alla selezione
    const report = data?.workbookRankingReport

    if (!report) return null

    return (
        <div className="p-4 space-y-6">
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
                    {report.totalStudents} studenti
                </span>
            </div>
            <RankingSection key={report.schema} report={report} />
        </div>
    )
}

function RankingSection({ report }: { report: RankingReport }) {
    const schemaName = schemas[report.schema].header

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <TopRanking ranking={report.ranking} />
        </div>
    )
}

function TopRanking({ ranking }: { ranking: RankingReport['ranking'] }) {
    if (ranking.length === 0) {
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
                    {ranking.map((entry) => (
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
