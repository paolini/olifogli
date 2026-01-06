import { ObjectId } from "bson";
import { RankingReport, Row, Sheet, useAddRowsMutation, useGetSheetsQuery, useGetSheetsRankingReportWithSelectionsQuery } from "../graphql/generated";
import Loading from "./Loading";
import Error from "./Error";
import { useState } from "react";
import Button from "./Button";
import { pluralize } from "../lib/util";

export default function SheetSelectionImport({sheet, data_rows, selectionWorkbookId}:{
    sheet: Sheet,
    data_rows: Row[],
    selectionWorkbookId: string
}) {    
    const { loading: loadingSheets, error: sheetsError, data: sheetsData } = useGetSheetsQuery({
        variables: { workbookId: new ObjectId(selectionWorkbookId) },
    });

    const querySheets = sheetsData?.sheets || [];

    const sheets = querySheets

    const filteredSheets = sheets.filter(s => s.schema === 'archimede_biennio')

    const { loading, error, data, refetch } = useGetSheetsRankingReportWithSelectionsQuery({
        variables: { 
            sheetIds: filteredSheets.map(s => s._id), 
            schema: 'archimede_biennio',
            selectionLabel: 'gara_prime',
            onlySelected: true,
        }
    });

    const rows = data?.sheetsRankingReport.ranking || [];

    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const [addRowsMutation] = useAddRowsMutation();

    const toggleRow = (id: string) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(rows.map(row => row.rowId.toString())));
        } else {
            setSelectedRows(new Set());
        }
    };

    const allSelected = rows.length > 0 && selectedRows.size === rows.length;

    if (loading || loadingSheets) return <Loading />;
    if (error) return <Error error={error} />;
    if (sheetsError) return <Error error={sheetsError} />;

    return <div>
        <Button className="my-2" disabled={selectedRows.size === 0} onClick={() => executeImport()}>
            Importa {pluralize(selectedRows.size,"riga selezionata","righe selezionate")}
        </Button>
        { selectedRows.size === 0  && <span className="mx-2">seleziona le righe da importare</span>}   
        <table>
            <thead>
                <tr>
                    <th><input type="checkbox" checked={allSelected} onChange={(e) => selectAll(e.target.checked)} /></th>
                    <th>Cognome</th>
                    <th>Nome</th>
                    <th>Data di nascita</th>
                    <th>Foglio</th>
                    <th>Sezione</th>
                    <th>Punteggio</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => 
                    <TableRow key={row.rowId.toString()} row={row} selectedRows={selectedRows} toggleRow={toggleRow} />
                )}
            </tbody>
        </table>
   </div>;

   async function executeImport() {
        const rowsToImport = rows.filter(r => selectedRows.has(r.rowId.toString()));
        await addRowsMutation({
            variables: {
                sheetId: sheet._id,
                columns: ["surname", "name", "birthDate", "codice_meccanografico", "nomeScuola", "cittàScuola", "classSection"],
                rows: rowsToImport.map(r => [
                    r.studentSurname || '',
                    r.studentName || '',
                    r.studentBirthDate || '',
                    r.sheetName || '',
                    '',
                    '',
                    r.classSection || '',
                ]),
            }
        })
        setSelectedRows(new Set());
   }
}

function TableRow({row, selectedRows, toggleRow}:{row:RankingReport['ranking'][0], selectedRows: Set<string>, toggleRow: (id: string) => void}) {
    return <tr style={{ backgroundColor: selectedRows.has(row.rowId.toString()) ? '#f0f0f0' : 'transparent' }}>
        <td><input type="checkbox" checked={selectedRows.has(row.rowId.toString())} onChange={() => toggleRow(row.rowId.toString())} /></td>
        <td>{row.studentSurname}</td>
        <td>{row.studentName}</td>
        <td>{row.studentBirthDate || ''}</td>
        <td>{row.sheetName}</td>
        <td>{row.classSection}</td>
        <td>{row.score}</td>
    </tr>
}   