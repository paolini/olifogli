import { ObjectId } from "bson";
import { RankingReport, Row, Sheet, useAddRowsMutation, useGetSheetsQuery, useGetWorkbookRankingReportWithSelectionsQuery } from "../graphql/generated";
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

    const sheets = querySheets.filter(s => s.commonData?.Distretto === sheet.name)

    const filteredSheets = sheets.filter(s => s.schema === 'archimede_biennio')

    const { loading, error, data, refetch } = useGetWorkbookRankingReportWithSelectionsQuery({
        variables: { 
            workbookId: new ObjectId(selectionWorkbookId), 
            schema: 'archimede_biennio',
            commonData: {},
            selectionLabel: 'gara_prime',
            onlySelected: true,
        }
    });

    const reports = data?.workbookRankingReport || [];

    const rows = reports?.length === 1 ? reports[0].ranking : [];

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

    const alreadyImportedNames = new Set(data_rows.map(r => `${r.data["surname"]}|${r.data["name"]}|${r.data["birthDate"]}`)); // cognome|nome|dataNascita
    const alreadyImportedRowIds = new Set(rows.filter(r => alreadyImportedNames.has(`${r.studentSurname}|${r.studentName}|${r.studentBirthDate}`)).map(r => r.rowId.toString()));
    const total = rows.length - alreadyImportedRowIds.size;

    const allSelected = total > 0 && selectedRows.size === total;
    const selectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(new Set(rows.filter(r => !alreadyImportedRowIds.has(r.rowId.toString())).map(row => row.rowId.toString())));
        } else {
            setSelectedRows(new Set());
        }
    };
    

    if (loading || loadingSheets) return <Loading />;
    if (error) return <Error error={error} />;
    if (sheetsError) return <Error error={sheetsError} />;

    return <div>
        { (rows.length === 0) &&
            <div>Nessuna riga è stata selezionata.</div>
        }
        <a href={`/workbook/${selectionWorkbookId}?tab=selezione`}>[pagina della selezione]</a>
        <br />
        <Button className="my-2" disabled={selectedRows.size === 0} onClick={() => executeImport()}>
            Importa {pluralize(selectedRows.size,"riga selezionata","righe selezionate")}
        </Button>
        { selectedRows.size === 0  && <span className="ml-2">seleziona le righe da importare,</span>}
        <span className="ml-2">{pluralize(alreadyImportedRowIds.size,"riga già importata","righe già importate")}</span>
        <table>
            <thead>
                <tr>
                    <th><input type="checkbox" checked={allSelected} onChange={(e) => selectAll(e.target.checked)} /></th>
                    <th>Cognome</th>
                    <th>Nome</th>
                    <th>Data di nascita</th>
                    <th>Scuola</th>
                    <th>Foglio</th>
                    <th>Città</th>
                    <th>Distretto</th>
                    <th>Sezione</th>
                    <th>Punteggio</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => 
                    <TableRow key={row.rowId.toString()} row={row} selectedRows={selectedRows} toggleRow={toggleRow} isAlreadyImported={alreadyImportedRowIds.has(row.rowId.toString())} />
                )}
            </tbody>
        </table>
   </div>;

   async function executeImport() {
        const rowsToImport = rows.filter(r => selectedRows.has(r.rowId.toString()));
        await addRowsMutation({
            variables: {
                sheetId: sheet._id,
                columns: ["surname", "name", "birthDate", "codice_meccanografico", "nome_scuola", "città_scuola", "classSection", "olimanager.participantId"],
                rows: rowsToImport.map(r => [
                    r.studentSurname || '',
                    r.studentName || '',
                    r.studentBirthDate || '',
                    r.sheetName || '',
                    r.school || '',
                    r.city || '',
                    r.classSection || '',
                    r.participantId || '',
                ]),
            }
        })
        setSelectedRows(new Set());
   }
}

function TableRow({row, selectedRows, toggleRow, isAlreadyImported}:{row:RankingReport['ranking'][0], selectedRows: Set<string>, toggleRow: (id: string) => void, isAlreadyImported: boolean}) {
    // const isAlreadyImported = alreadyImportedNames.has(`${row.studentSurname}|${row.studentName}|${row.studentBirthDate}`);
    return <tr style={{ backgroundColor: isAlreadyImported ? '#c5f3bdff' : selectedRows.has(row.rowId.toString()) ? '#f0f0f0' : 'transparent' }}>
        <td>{isAlreadyImported ? '✔' : <input type="checkbox" checked={selectedRows.has(row.rowId.toString())} onChange={() => toggleRow(row.rowId.toString())} />}</td>
        <td>{row.studentSurname}</td>
        <td>{row.studentName}</td>
        <td>{row.studentBirthDate || ''}</td>
        <td>{row.school || ''}</td>
        <td><a href={`/sheet/${row.sheetId}`}>{row.sheetName}</a></td>
        <td>{row.city}</td>
        <td>{row.district}</td>
        <td>{row.classSection}</td>
        <td>{row.score}</td>
    </tr>
}   