'use client'

import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { useState } from 'react'
import Error from './Error'
import Loading from './Loading'
import { useGetWorkbookAnomalyReportQuery, WorkbookAnomalyReport } from '../graphql/generated'

const _ = gql`
    query GetWorkbookAnomalyReport($workbookId: ObjectId!) {
        workbookAnomalyReport(workbookId: $workbookId) {
            statistics {
                nameLetterDistribution {
                    letter
                    count
                }
                surnameLetterDistribution {
                    letter
                    count
                }
                birthDateStats {
                    mean
                    stdDev
                    min
                    max
                }
            }
            outliers {
                row {
                    _id
                    data
                    error
                }
                anomalyScore
            }
        }
    }
`

export default function WorkbookAgeDistribution({ workbookId }: { workbookId: ObjectId }) {
    const { loading, error, data } = useGetWorkbookAnomalyReportQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    })

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const report = data?.workbookAnomalyReport

    if (!report) return <p>Nessun dato disponibile</p>

    return (
        <div className="p-4 space-y-6">
            <AnomalyStatisticsSection statistics={report.statistics} />
            <OutliersSection outliers={report.outliers} />
        </div>
    )
}

function AnomalyStatisticsSection({ statistics }: { statistics: WorkbookAnomalyReport['statistics'] }) {
    return (
        <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-xl font-semibold">Statistiche Anomalie</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <LetterDistributionChart title="Distribuzione Lettere Nomi" data={statistics.nameLetterDistribution} />
                <LetterDistributionChart title="Distribuzione Lettere Cognomi" data={statistics.surnameLetterDistribution} />
                <BirthDateStats stats={statistics.birthDateStats} />
            </div>
        </div>
    )
}

function LetterDistributionChart({ title, data }: { title: string, data: { letter: string, count: number }[] }) {
    const total = data.reduce((sum, item) => sum + item.count, 0)
    const sortedData = data.sort((a, b) => b.count - a.count)

    return (
        <div>
            <h4 className="font-medium mb-2">{title}</h4>
            <div className="space-y-1">
                {sortedData.slice(0, 10).map(item => (
                    <div key={item.letter} className="flex justify-between">
                        <span>{item.letter}</span>
                        <span>{item.count} ({((item.count / total) * 100).toFixed(1)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function BirthDateStats({ stats }: { stats: WorkbookAnomalyReport['statistics']['birthDateStats'] }) {
    if (!stats) return <div>Nessuna statistica disponibile</div>

    return (
        <div>
            <h4 className="font-medium mb-2">Statistiche Date di Nascita</h4>
            <div className="space-y-1">
                <div>Media: {new Date(stats.mean).toLocaleDateString()}</div>
                <div>Deviazione Standard: {Math.round(stats.stdDev / (1000 * 60 * 60 * 24))} giorni</div>
                <div>Min: {new Date(stats.min).toLocaleDateString()}</div>
                <div>Max: {new Date(stats.max).toLocaleDateString()}</div>
            </div>
        </div>
    )
}

function OutliersSection({ outliers }: { outliers: WorkbookAnomalyReport['outliers'] }) {
    const [showAll, setShowAll] = useState(false)
    const displayedOutliers = showAll ? outliers : outliers.slice(0, 10)

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-xl font-semibold">Righe con Anomalie più Alte</h3>
            <table className="w-full table-auto">
                <thead>
                    <tr className="border-b">
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Cognome</th>
                        <th className="text-left p-2">Data Nascita</th>
                        <th className="text-left p-2">Punteggio Anomalia</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedOutliers.map(outlier => (
                        <tr key={outlier.row._id.toString()} className="border-b">
                            <td className="p-2">{outlier.row.data?.name || ''}</td>
                            <td className="p-2">{outlier.row.data?.surname || ''}</td>
                            <td className="p-2">{outlier.row.data?.birthDate ? new Date(outlier.row.data.birthDate).toLocaleDateString() : ''}</td>
                            <td className="p-2">{outlier.anomalyScore.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {outliers.length > 10 && (
                <button 
                    onClick={() => setShowAll(!showAll)}
                    className="text-blue-600 hover:text-blue-800"
                >
                    {showAll ? 'Mostra meno' : `Mostra tutte (${outliers.length})`}
                </button>
            )}
        </div>
    )
}
