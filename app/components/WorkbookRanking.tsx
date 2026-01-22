"use client"

import { useState } from 'react'
import { gql, ApolloQueryResult } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { SheetState, useGetSheetsQuery, useGetWorkbookRankingReportLazyQuery, useGetWorkbookRankingReportQuery } from '../graphql/generated'
import type { RankingReport, GetWorkbookRankingReportQuery } from '../graphql/generated'
import { schemas } from '../lib/schema'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import Papa from 'papaparse'
import SheetsSortIcon from './SheetsSortIcon'
import Button from './Button'
import { score_to_color_style } from '../lib/schema/fields'

const _ = gql`
    query GetWorkbookRankingReport($workbookId: ObjectId!, $schema: String, $commonData: Data, $state: SheetState, $limit: Int, $selectionLabel: String, $onlySelected: Boolean, $orderBy: String, $orderDirection: Int) {
        workbookRankingReport(workbookId: $workbookId, schema: $schema, commonData: $commonData, state: $state, limit: $limit, selectionLabel: $selectionLabel, onlySelected: $onlySelected, orderBy: $orderBy, orderDirection: $orderDirection) {
            schema
            totalStudents
            ranking {
                sheetId
                sheetName
                studentName
                studentSurname
                school
                city
                district
                classYear
                classSection
                score
                rank
                rowId
                sheet {
                    commonData
                }
            }
        }
    }
`

export default function WorkbookRanking({ workbookId }: { workbookId: ObjectId }) {
    const [limit, setLimit] = useState<number>(100);
    const [sortRanking, setSortRanking] = useState<{field: string, direction: number} | null>(null);
    const { loading: loadingSheets, error: sheetsError, data: sheetsData } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    });
    const { filterState, columnFilters, setColumnFilters, sort, setSort } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' });
    const sheets = (sheetsData?.sheets || [])
        .filter(s => ["archimede_biennio", "archimede_triennio"].includes(s.schema));
    const filteredSheets = filterSheets(filterState, sheets);

    const { loading, error, data } = useGetWorkbookRankingReportQuery({
        variables: { workbookId, schema: filterState?.schemaFilter || null, commonData: filterState?.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null, state: (filterState?.statoFilter as SheetState) || null, limit, selectionLabel: null, onlySelected: false, orderBy: sortRanking?.field, orderDirection: sortRanking?.direction },
        skip: !filterState?.schemaFilter,
        pollInterval: 10000, // millisecondi
    });
    
    const [getFullRanking] = useGetWorkbookRankingReportLazyQuery();
    
    if (loading) return <Loading />
    if (error) return <Error error={error} />
    if (sheetsError) return <Error error={sheetsError} />

    const reports: RankingReport[] | undefined = data?.workbookRankingReport

    const report = reports && reports[0];

    const handleShowMore = () => setLimit(limit => limit * 10);

    return <>
            <div className="flex justify-between items-start">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
                <Button onClick={downloadCSV}>download CSV</Button>
            </div>
            { reports?.length === 0 && <p className="text-gray-600">Nessun dato disponibile</p> }
            { !filterState?.schemaFilter && <p className="text-gray-600">Seleziona uno schema per visualizzare la classifica.</p> }

            { report && 
                <RankingSection
                    key={report.schema}
                    report={report}
                    onShowMore={handleShowMore}
                    canShowMore={limit !== undefined && report.ranking.length === limit}
                />
            }
    </>

    function downloadCSV() {
        getFullRanking({
            variables: { workbookId, schema: filterState?.schemaFilter, commonData: {}, limit: undefined, selectionLabel: null, onlySelected: false, orderBy: null, orderDirection: null }
        }).then((result) => {
            const data = result.data;
            if (data?.workbookRankingReport && data.workbookRankingReport.length > 0) {
                const report = data.workbookRankingReport[0];
                const csvData = report.ranking.map((entry: RankingReport['ranking'][0]) => ({
                    'Posizione': entry.rank,
                    'Punti': Math.round(entry.score),
                    'Cognome': entry.studentSurname,
                    'Nome': entry.studentName,
                    'Scuola': entry.sheetName,
                    'Città': entry.city,
                    'Distretto': entry.district,
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
                    sortRanking={sortRanking}
                    setSortRanking={setSortRanking}
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

    function TopRanking({ ranking, sortRanking, setSortRanking }: { ranking: RankingReport['ranking'], sortRanking: {field: string, direction: number} | null, setSortRanking: React.Dispatch<React.SetStateAction<{field: string, direction: number} | null>> }) {
        if (ranking.length === 0) {
            return <p className="text-gray-600">Nessun dato disponibile</p>;
        }
        return (
            <div className="overflow-x-auto">
                <table className="border-collapse">
                    <thead>
                        <tr className="my-table">
                            <Th field="rank" header="Pos." sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="score" header="Punti" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="studentSurname" header="Cognome" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="studentName" header="Nome" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="school" header="Scuola" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="sheetName" header="Codice" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="city" header="Città" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="district" header="Distretto" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="classYear" header="Anno" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                            <Th field="classSection" header="Sezione" sortRanking={sortRanking} setSortRanking={setSortRanking} />
                        </tr>
                    </thead>
                    <tbody>
                        {ranking.map((entry) => (
                            <tr key={`${entry.sheetId}-${entry.rank}`} className="hover:bg-gray-50">
                                <td className="border p-2 text-center">{entry.rank}</td>
                                <td className="border p-2 text-center font-semibold" style={score_to_color_style(entry.score.toString())}>{Math.round(entry.score)}</td>
                                <td className="border p-2 text-left w-40 truncate" title={entry.studentSurname}>{entry.studentSurname}</td>
                                <td className="border p-2 text-left w-40 truncate" title={entry.studentName}>{entry.studentName}</td>
                                <td className="border p-2 text-left max-w-48 truncate" title={entry.school || ''}>{entry.school}</td>
                                <td className="border p-2 text-left max-w-48 truncate" title={entry.sheetName}><a href={`/sheet/${entry.sheetId}`}>{entry.sheetName}</a></td>
                                <td className="border p-2 text-left">{entry.city}</td>
                                <td className="border p-2 text-left">{entry.district}</td>
                                <td className="border p-2 text-center">{entry.classYear}</td>
                                <td className="border p-2 text-center">{entry.classSection}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function Th({ field, header, sortRanking, setSortRanking }: { field: string, header: string, sortRanking: {field: string, direction: number} | null, setSortRanking: React.Dispatch<React.SetStateAction<{field: string, direction: number} | null>> }) {
        return <th className="border p-2 text-center" style={{ position: 'relative' }}>
            <span className="flex items-center justify-between gap-2">
                <span>{header}</span>
                <span style={{ cursor: 'pointer' }} onClick={() => {
                    setSortRanking((s) => {
                        if (!s || s.field !== field) return { field: field, direction: 1 };
                        if (s.direction === 1) return { field: field, direction: -1 };
                        return null;
                    });
                }}>
                    <SheetsSortIcon direction={sortRanking?.field === field ? sortRanking.direction : undefined} />
                </span>
            </span>
        </th>;
    }
}
