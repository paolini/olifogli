'use client'

import { useState } from 'react'
import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { RankingReport, useGetSheetsQuery, useGetSheetsRankingReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets, useSheetsFilterState } from './SheetsFilter'

const _ = gql`
    query GetSheetsRankingReport($sheetIds: [ObjectId!]!, $schema: String!) {
        sheetsRankingReport(sheetIds: $sheetIds, schema: $schema) {
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
    const { loading: loadingSheets, error: sheetsError, data: sheetsData, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })
    const filterState = useSheetsFilterState({ schema: 'archimede_biennio' })
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio","archimede_triennio"].includes(s.schema))
    const filteredSheets = filterSheets(filterState, sheets)

    const { loading, error, data } = useGetSheetsRankingReportQuery({
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter },
        pollInterval: 10000, // millisecondi
    })
    
    if (loading) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsRankingReport

    if (!report) return null

    return (
        <div className="p-4 space-y-6 max-w-6xl">
            <div className="flex items-center gap-3">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
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
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border p-2 text-left w-16">Pos.</th>
                        <th className="border p-2 text-left">Cognome</th>
                        <th className="border p-2 text-left">Nome</th>
                        <th className="border p-2 text-left w-20">Classe</th>
                        <th className="border p-2 text-left w-20">Sez.</th>
                        <th className="border p-2 text-left">Foglio</th>
                        <th className="border p-2 text-right w-24">Punti</th>
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
                            <td className="border p-2 text-sm text-gray-600 truncate max-w-xs" title={entry.sheetName}>{entry.sheetName}</td>
                            <td className="border p-2 text-right font-semibold">{entry.score.toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

