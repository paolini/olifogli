"use client"

import { useState, useEffect, useMemo } from 'react'
import { gql, useQuery, useMutation, ApolloError } from '@apollo/client'
import { ObjectId } from 'bson'
import Error from './Error'
import Loading from './Loading'
import { RankingReport, useGetSheetsQuery, User } from '../graphql/generated'
import { score_to_color_style } from '../lib/schema/ArchimedeCommon'
import { schemas } from '../lib/schema'
import Button from './Button'
import SheetsFilter, { filterSheets } from './SheetsFilter'
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery'

const GET_SHEETS_RANKING_REPORT_WITH_SELECTIONS = gql`
    query GetSheetsRankingReportWithSelections($sheetIds: [ObjectId!]!, $schema: String!, $limit: Int, $selectionLabel: String, $onlySelected: Boolean) {
        sheetsRankingReport(sheetIds: $sheetIds, schema: $schema, limit: $limit, selectionLabel: $selectionLabel, onlySelected: $onlySelected) {
            schema
            totalStudents
            ranking {
                rowId
                sheetId
                sheetName
                studentName
                studentSurname
                studentBirthDate
                classYear
                classSection
                score
                rank
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
        .filter(s => ["archimede_biennio", "archimede_triennio"].includes(s.schema));

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

    const { loading, error, data, refetch } = useQuery(GET_SHEETS_RANKING_REPORT_WITH_SELECTIONS, {
        variables: { 
            sheetIds: filteredSheets.map(s => s._id), 
            schema: selectedSelection?.schema || '', 
            limit,
            selectionLabel: selectedSelection?.label,
            onlySelected,
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

    const handleShowMore = () => setLimit(limit => limit * 10);

    const handleToggleSelection = async (rowId: ObjectId, label: string, isSelected: boolean) => {
        // Ottieni i dati attuali per l'update ottimistico
        const currentData = data?.sheetsRankingReport;
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
                        query: GET_SHEETS_RANKING_REPORT_WITH_SELECTIONS,
                        variables: { 
                            sheetIds: filteredSheets.map(s => s._id), 
                            schema: selectedSelection?.schema || '', 
                            limit,
                            selectionLabel: selectedSelection?.label,
                            onlySelected
                        }
                    };

                    const existingData = cache.readQuery(queryKey) as { sheetsRankingReport: RankingReport } | null;
                    if (!existingData) return;

                    const updatedRanking = existingData.sheetsRankingReport.ranking.map(entry => {
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
                            sheetsRankingReport: {
                                ...existingData.sheetsRankingReport,
                                ranking: updatedRanking
                            }
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
        <div className="p-4 space-y-6 max-w-6xl">
            <div className="flex justify-between items-start">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets} />
            </div>

            {availableSelections.length === 0 && 
                <div className="p-4">
                    <p className="text-gray-600">Nessuna selezione disponibile per gli schemi presenti.</p>
                </div>
            }

            {availableSelections.length > 0 && <div className="flex items-center space-x-4">
                <label htmlFor="selection-select" className="font-semibold">Seleziona tipo:</label>
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
                    <span>Mostra solo selezionati</span>
                </label>
            </div>}

            {selectedSelection && availableSelections.length > 0 && (
                <SelectionSection
                    profile={profile}
                    key={`${selectedSelection.schema}-${selectedSelection.label}`}
                    report={data?.sheetsRankingReport}
                    selection={selectedSelection}
                    onToggleSelection={handleToggleSelection}
                    onShowMore={handleShowMore}
                    canShowMore={limit !== undefined && (data?.sheetsRankingReport?.ranking.length || 0) === limit}
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

function SelectionTable({ ranking, selectionLabel, onToggleSelection }: {
    ranking: RankingReport['ranking'],
    selectionLabel: string,
    onToggleSelection: (rowId: ObjectId, label: string, isSelected: boolean) => void
}) {
    if (ranking.length === 0) {
        return <p className="text-gray-600">Nessun dato disponibile</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="my-table">
                        <th className="border p-2 text-center w-16">Seleziona</th>
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
                                <td className="border p-2 text-center w-48 truncate" title={entry.sheetName}>{entry.sheetName}</td>
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
