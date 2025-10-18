'use client'

import { useState } from 'react'
import { gql, useQuery } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import Button from './Button'
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
            scoreDistribution {
                score
                count
            }
        }
    }
`

export default function WorkbookReport({ workbookId }: { workbookId: ObjectId }) {
    const { loading, error, data } = useQuery<{ workbookReports: WorkbookReportType[] }>(GET_WORKBOOK_REPORTS, {
        variables: { workbookId }
    })

    if (loading) return <Loading />
    if (error) return <Error error={error} />
    if (!data?.workbookReports || data.workbookReports.length === 0) {
        return <div className="p-4">
            <p>Nessun report disponibile. Sono necessari fogli con schema archimede-biennio o archimede-triennio.</p>
        </div>
    }

    return (
        <div className="p-4 space-y-6">
            <h2 className="text-2xl font-bold">Report Raccolta</h2>
            {data.workbookReports.map(report => (
                <ReportSection key={report.schema} report={report} />
            ))}
        </div>
    )
}

function ReportSection({ report }: { report: WorkbookReportType }) {
    const [activeTab, setActiveTab] = useState<'classifica' | 'grafico'>('classifica')

    const schemaName = report.schema === 'archimede-biennio' ? 'Archimede Biennio' : 'Archimede Triennio'

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>

            <div className="flex gap-2 border-b">
                <Button 
                    onClick={() => setActiveTab('classifica')}
                    className={activeTab === 'classifica' ? 'border-b-2 border-blue-500' : ''}
                >
                    Top 100
                </Button>
                <Button 
                    onClick={() => setActiveTab('grafico')}
                    className={activeTab === 'grafico' ? 'border-b-2 border-blue-500' : ''}
                >
                    Distribuzione Punteggi
                </Button>
            </div>

            {activeTab === 'classifica' && <TopRanking top100={report.top100} />}
            {activeTab === 'grafico' && <ScoreDistributionChart distribution={report.scoreDistribution} />}
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
