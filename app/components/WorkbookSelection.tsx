"use client"

import { useState, useEffect, useMemo } from 'react'
import { gql, useMutation, ApolloError } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { RankingReport, useGetSheetsQuery, User, useGetWorkbookRankingReportWithSelectionsQuery, GetWorkbookRankingReportWithSelectionsDocument } from '../graphql/generated'
import { schemas } from '../lib/schema'
import Button from './Button'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'
import SheetsSortIcon from './SheetsSortIcon'
import { score_to_color_style } from '../lib/schema/fields'
import Competition from '../lib/schema/Competition'

const _ = gql`
    query GetWorkbookRankingReportWithSelections($workbookId: ObjectId!, $schema: String, $state: SheetState, $commonData: Data, $limit: Int, $selectionLabel: String, $onlySelected: Boolean, $orderBy: String, $orderDirection: Int) {
        workbookRankingReport(workbookId: $workbookId, schema: $schema, state: $state, commonData: $commonData, limit: $limit, selectionLabel: $selectionLabel, onlySelected: $onlySelected, orderBy: $orderBy, orderDirection: $orderDirection) {
            schema
            totalStudents
            ranking {
                rowId
                sheetId
                sheetName
                studentName
                studentSurname
                studentBirthDate
                school
                city
                district
                classYear
                classSection
                score
                rank
                participantId
                selections {
                    label
                    selected_by
                    timestamp
                }
                sheet {
                    commonData
                }
            }
        }
    }
`

const TOGGLE_SELECTION = gql`
    mutation ToggleSelection($rowId: ObjectId!, $label: String!) {
        toggleSelection(rowId: $rowId, label: $label) {
            _id
            selections { label selected_by timestamp }
        }
    }
`

type SelectionOption = {
    label: string
    name: string
    schema: string
    color: string
    row_filter?: Record<string, unknown>
}

export default function WorkbookSelection({ workbookId, profile }: { workbookId: ObjectId, profile?: User }) {
    const [limit, setLimit] = useState<number>(100);
    const { filterState, columnFilters, setColumnFilters, sort, setSort } = useSheetsFilterWithQuerystring({ schema: 'archimede_biennio' });
    const { loading: loadingSheets, error: sheetsError, data: sheetsData } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000, // millisecondi
    });

    const querySheets = sheetsData?.sheets || [];

    const filteredSheetsFirst = filterSheets(filterState, querySheets);

    const sheets = filteredSheetsFirst
        .filter(s => schemas[s.schema] instanceof Competition);

    // Ottieni tutte le selections disponibili
    const availableSelections: SelectionOption[] = useMemo(() => {
        const selections: SelectionOption[] = [];
        const schemasWithSheets = new Set(sheets.map(s => s.schema));
        for (const schemaKey of schemasWithSheets) {
            const schema = schemas[schemaKey];
            if (schema?.selections) {
                for (const sel of schema.selections) {
                    selections.push({
                        label: sel.label,
                        name: sel.name,
                        schema: schemaKey,
                        color: sel.color,
                        row_filter: sel.row_filter
                    });
                }
            }
        }
        return selections;
    }, [sheets]);

    const [selectedSelection, setSelectedSelection] = useState<SelectionOption | null>(null);

    const filteredSheets = selectedSelection ? sheets.filter(s => s.schema === selectedSelection.schema) : [];
    const [onlySelected, setOnlySelected] = useState<boolean>(false);
    const [sortRanking, setSortRanking] = useState<{field: string, direction: number} | null>(null);

    const { loading, error, data, refetch } = useGetWorkbookRankingReportWithSelectionsQuery({
        variables: { 
            workbookId, 
            schema: selectedSelection?.schema || '', 
            commonData: {},
            limit,
            selectionLabel: selectedSelection?.label,
            onlySelected,
            orderBy: sortRanking?.field,
            orderDirection: sortRanking?.direction,
        },
        pollInterval: 0, // Disabilitato
        skip: !selectedSelection, // Non eseguire la query se non c'è selezione
    });

    const [toggleSelectionMutation] = useMutation(TOGGLE_SELECTION);

    // Imposta la selezione iniziale quando availableSelections è disponibile
    useEffect(() => {
        if (availableSelections.length > 0 && !selectedSelection) {
            setSelectedSelection(availableSelections[0]);
        }
    }, [availableSelections, selectedSelection]);

    if (loadingSheets) return <Loading />
    if (sheetsError) return <Error error={sheetsError} />

    const report = data?.workbookRankingReport[0];

    const handleShowMore = () => setLimit(limit => limit * 10);

    const handleToggleSelection = async (rowId: ObjectId, label: string, isSelected: boolean) => {
        // Ottieni i dati attuali per l'update ottimistico
        const currentData = data?.workbookRankingReport;
        if (!currentData) return;

        try {
            await toggleSelectionMutation({
                variables: { rowId, label },
                optimisticResponse: {
                    toggleSelection: {
                        __typename: 'Row',
                        _id: rowId,
                        selections: isSelected ? [{ __typename: 'RowSelection', label, selected_by: 'optimistic', timestamp: new Date() }] : []
                    }
                },
                update: (cache, { data: mutationData }) => {
                    if (!mutationData?.toggleSelection) return;

                    // Aggiorna la cache ottimisticamente
                    const queryKey = {
                        query: GetWorkbookRankingReportWithSelectionsDocument,
                        variables: { 
                            workbookId, 
                            schema: selectedSelection?.schema || '', 
                            commonData: {},
                            limit,
                            selectionLabel: selectedSelection?.label,
                            onlySelected,
                            orderBy: sortRanking?.field,
                            orderDirection: sortRanking?.direction,
                        }
                    };

                    const existingData = cache.readQuery(queryKey) as { workbookRankingReport: RankingReport[] } | null;
                    if (!existingData || !existingData.workbookRankingReport.length) return;

                    const report = existingData.workbookRankingReport[0];
                    const updatedRanking = report.ranking.map(entry => {
                        if (entry.rowId === rowId) {
                            const currentSelections = entry.selections || [];
                            let newSelections;
                            if (isSelected) {
                                // Aggiungi la selezione se non presente
                                if (!currentSelections.some(s => s?.label === label)) {
                                    newSelections = [...currentSelections, {
                                        label,
                                        selected_by: 'optimistic', // Placeholder
                                        timestamp: new Date()
                                    }];
                                } else {
                                    newSelections = currentSelections;
                                }
                            } else {
                                // Rimuovi la selezione
                                newSelections = currentSelections.filter(s => s?.label !== label);
                            }
                            return {
                                ...entry,
                                selections: newSelections
                            };
                        }
                        return entry;
                    });

                    cache.writeQuery({
                        ...queryKey,
                        data: {
                            workbookRankingReport: [{
                                ...report,
                                ranking: updatedRanking
                            }]
                        }
                    });
                }
            });
        } catch (err) {
            console.error('Error toggling selection:', err);
            // In caso di errore, il refetch dovrebbe ripristinare lo stato corretto
            refetch();
        }
    };

    const handleSelectionChange = (value: string) => {
        const selection = availableSelections.find(s => `${s.schema}-${s.label}` === value);
        setSelectedSelection(selection || null);
        setLimit(100); // Reset limit when changing selection
    };

    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-start">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            </div>

            {availableSelections.length === 0 && 
                <div className="p-4">
                    <p className="text-gray-600">Nessuna selezione disponibile per gli schemi presenti.</p>
                </div>
            }

            {availableSelections.length > 0 && <div className="flex items-center space-x-4">
                <label htmlFor="selection-select" className="font-semibold">Seleziona segnalazione:</label>
                <select
                    id="selection-select"
                    value={selectedSelection ? `${selectedSelection.schema}-${selectedSelection.label}` : ''}
                    onChange={(e) => handleSelectionChange(e.target.value)}
                    className="border rounded px-3 py-2"
                >
                    {availableSelections.map(sel => (
                        <option key={`${sel.schema}-${sel.label}`} value={`${sel.schema}-${sel.label}`}>
                            {sel.name} ({schemas[sel.schema]?.header})
                        </option>
                    ))}
                </select>
                <label className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        checked={onlySelected}
                        onChange={(e) => setOnlySelected(e.target.checked)}
                        className="w-4 h-4"
                    />
                    <span>Mostra solo segnalati</span>
                </label>
            </div>}

            {report && selectedSelection && availableSelections.length > 0 && (
                <SelectionSection
                    profile={profile}
                    key={`${selectedSelection.schema}-${selectedSelection.label}`}
                    report={report}
                    selection={selectedSelection}
                    onToggleSelection={handleToggleSelection}
                    onShowMore={handleShowMore}
                    canShowMore={limit !== undefined && (report?.ranking.length || 0) === limit}
                    loading={loading}
                    error={error}
                />
            )}
        </div>
    );

function SelectionSection({ 
    profile,
    report, 
    selection, 
    onToggleSelection, 
    onShowMore, 
    canShowMore, 
    loading, 
    error 
}: {
    profile?: User,
    report?: RankingReport,
    selection: SelectionOption,
    onToggleSelection: (rowId: ObjectId, label: string, isSelected: boolean) => void,
    onShowMore: () => void,
    canShowMore: boolean,
    loading: boolean,
    error?: ApolloError
}) {
    if (loading) return <Loading />
    if (error) return <Error error={error} />

    if (!report) return null;

    const schema = report.schema;
    const schemaName = schemas[schema]?.header;

    return <>
        <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{selection.name} - {schemaName}</h3>
                <span className="text-gray-600">Totale studenti: {report.totalStudents}</span>
            </div>
            <SelectionTable
                ranking={report.ranking}
                selectionLabel={selection.label}
                onToggleSelection={onToggleSelection}
                sortRanking={sortRanking}
                setSortRanking={setSortRanking}
            />
            {canShowMore && (
                <div className="flex justify-center mt-4">
                    <Button onClick={onShowMore}>
                        Carica altri
                    </Button>
                </div>
            )}
        </div>
    </>
}

function SelectionTable({ ranking, selectionLabel, onToggleSelection, sortRanking, setSortRanking }: {
    ranking: RankingReport['ranking'],
    selectionLabel: string,
    onToggleSelection: (rowId: ObjectId, label: string, isSelected: boolean) => void,
    sortRanking: {field: string, direction: number} | null,
    setSortRanking: React.Dispatch<React.SetStateAction<{field: string, direction: number} | null>>
}) {
    if (ranking.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse">
                <thead>
                    <tr className="my-table">
                        <th className="border p-2 text-center w-16">Seleziona</th>
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
                    {ranking.map((entry) => {
                        const isSelected = entry.selections?.some(s => s?.label === selectionLabel) || false;
                        return (
                            <tr key={`${entry.sheetId}-${entry.rank}`} className={`${isSelected ? 'bg-gray-100' : ''}`}>
                                <td className="border p-2 text-center">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => onToggleSelection(entry.rowId, selectionLabel, e.target.checked)}
                                        className="w-4 h-4"
                                    />
                                </td>
                                <td className="border p-2 text-center">{entry.rank}</td>
                                <td className="border p-2 text-center font-semibold" style={score_to_color_style(entry.score.toString())}>{Math.round(entry.score)}</td>
                                <td className="border p-2 text-left w-40 truncate" title={entry.studentSurname}>{entry.studentSurname}</td>
                                <td className="border p-2 text-left w-40 truncate" title={entry.studentName}>{entry.studentName}</td>
                                <td className="border p-2 text-center max-w-48 truncate" title={entry.school || ''}>{entry.school}</td>
                                <td className="border p-2 text-center w-20 truncate" title={entry.sheetName}><a href={`/sheet/${entry.sheetId}`}>{entry.sheetName}</a></td>
                                <td className="border p-2 text-left w-20 truncate">{entry.city}</td>
                                <td className="border p-2 text-left w-20 truncate">{entry.district}</td>
                                <td className="border p-2 text-center">{entry.classYear}</td>
                                <td className="border p-2 text-center">{entry.classSection}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
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
