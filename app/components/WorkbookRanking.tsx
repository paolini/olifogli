"use client"

import { useState } from 'react'
import { gql, useLazyQuery, useQuery } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { RankingReport, useGetSheetsQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import { score_to_color_style } from '../lib/schema/ArchimedeCommon'
import Papa from 'papaparse'
import Button from './Button'
import { RowSelection } from '../lib/models'

const GET_SHEETS_RANKING_REPORT = gql`
    query GetSheetsRankingReport($sheetIds: [ObjectId!]!, $schema: String!, $limit: Int) {
        sheetsRankingReport(sheetIds: $sheetIds, schema: $schema, limit: $limit) {
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
    const [limit, setLimit] = useState<number>(100);
    const { loading: loadingSheets, error: sheetsError, data: sheetsData } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    });
    const { filterState, columnFilters, setColumnFilters, sort, setSort } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' });
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio", "archimede_triennio"].includes(s.schema));
    const filteredSheets = filterSheets(filterState, sheets);

    const { loading, error, data } = useQuery(GET_SHEETS_RANKING_REPORT, {
        variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter, limit },
        pollInterval: 10000, // millisecondi
    });
    
    const [getFullRanking] = useLazyQuery(GET_SHEETS_RANKING_REPORT);
    
    if (loading) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.sheetsRankingReport

    if (!report) return null

    const handleShowMore = () => setLimit(limit => limit * 2);

    function downloadCSV() {
        getFullRanking({
            variables: { sheetIds: filteredSheets.map(s => s._id), schema: filterState?.schemaFilter, limit: undefined }
        }).then((result) => {
            const data = result.data as { sheetsRankingReport: RankingReport };
            if (data?.sheetsRankingReport) {
                const csvData = data.sheetsRankingReport.ranking.map((entry: RankingReport['ranking'][0]) => ({
                    'Posizione': entry.rank,
                    'Punti': Math.round(entry.score),
                    'Cognome': entry.studentSurname,
                    'Nome': entry.studentName,
                    'Scuola': entry.sheetName,
                    'Anno': entry.classYear,
                    'Sezione': entry.classSection
                }));
                const csv = Papa.unparse(csvData);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'ranking.csv';
                link.click();
            }
        });
    }

    return (
        <div className="p-4 space-y-6 max-w-6xl">
            <div className="flex justify-between items-start">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
                <Button onClick={downloadCSV}>download CSV</Button>
            </div>
            <RankingSection
                key={report.schema}
                report={report}
                onShowMore={handleShowMore}
                canShowMore={limit !== undefined && report.ranking.length === limit}
            />
        </div>
    );

function RankingSection({ report, onShowMore, canShowMore }: { report: RankingReport, onShowMore: () => void, canShowMore: boolean }) {
    const schema = report.schema;
    const schemaName = schemas[schema]?.header;

    if (!schemaName) return <Error error={"Schema non selezionato"} />;

    return (
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>
            <TopRanking 
                ranking={report.ranking} 
            />
            {canShowMore && (
                <div className="flex justify-center mt-4">
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                        onClick={onShowMore}
                    >
                        Carica altri
                    </button>
                </div>
            )}
        </div>
    );
}

function TopRanking({ ranking }: { ranking: RankingReport['ranking'] }) {
    if (ranking.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="my-table">
                        <th className="border p-2 text-center w-16">Pos.</th>
                        <th className="border p-2 text-center w-24">Punti</th>
                        <th className="border p-2 text-center w-40">Cognome</th>
                        <th className="border p-2 text-center w-40">Nome</th>
                        <th className="border p-2 text-center w-48">Scuola</th>
                        <th className="border p-2 text-center w-20">Anno</th>
                        <th className="border p-2 text-center w-20">Sezione</th>
                    </tr>
                </thead>
                <tbody>
                    {ranking.map((entry) => (
                        <tr key={`${entry.sheetId}-${entry.rank}`} className="hover:bg-gray-50">
                            <td className="border p-2 text-center">{entry.rank}</td>
                            <td className="border p-2 text-center font-semibold" style={score_to_color_style(entry.score.toString())}>{Math.round(entry.score)}</td>
                            <td className="border p-2 text-left w-40 truncate" title={entry.studentSurname}>{entry.studentSurname}</td>
                            <td className="border p-2 text-left w-40 truncate" title={entry.studentName}>{entry.studentName}</td>
                            <td className="border p-2 text-center w-48 truncate" title={entry.sheetName}>{entry.sheetName}</td>
                            <td className="border p-2 text-center">{entry.classYear}</td>
                            <td className="border p-2 text-center">{entry.classSection}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
}

