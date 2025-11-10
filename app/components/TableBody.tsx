import { Dispatch, SetStateAction, useEffect } from "react"
import { Row, Sheet } from "../graphql/generated"
import TableRow, { RowSelectionState } from "./TableRow"
import Schema from "../lib/schema/Schema"
import { Column, Line, newLine, TableState } from "./Table"
import { ApolloError, gql, StoreObject, useMutation } from "@apollo/client"
import Button from "./Button"

export type TableBodyInput = {
    schema: Schema,
    sheet: Sheet,
    showStandardAnswers: boolean,
}

export default function TableBody({edit, sheet, schema, rows, columns, tableState, setTableState, showStandardAnswers, refresh, refreshLoading, loading, error, dismissErrors, onCellClick, addNewRow, setLineData, cellKeyDown
}: {
    edit: boolean,
    sheet: Sheet,
    schema: Schema,
    rows: Row[],
    columns: Column[],
    tableState: TableState,
    setTableState: Dispatch<SetStateAction<TableState>>,
    showStandardAnswers: boolean,
    refresh?: () => Promise<void>,
    refreshLoading?: boolean,
    loading: boolean,
    error: ApolloError | undefined,
    dismissErrors: () => void,
    onCellClick: (column: Column, line: Line) => void,
    addNewRow: () => void,
    setLineData: (line: Line, field: string, value: string | undefined) => void,
    cellKeyDown: (key: string, input: HTMLInputElement, preventDefault: () => void, stopPropagation: () => void) => void,
}) {
    useEffect(effectFunction, [rows, setTableState]);

    const focusLine = tableState.lines.find(l => l.key === tableState.focusLineKey)

    return <tbody>
        {tableState.lines.map(line => {
            const focusColumnName=tableState.focusLineKey === line.key ? tableState.focusFieldName : ''
            if (tableState.focusLineKey === line.key && error) {
              return  <tr key={`error-${line.key}`} className="error" onClick={() => dismissErrors()}><td colSpan={columns.length + 1}>{error.message}</td><td></td></tr>
            }
            return <TableRow
                  edit={edit}
                  isEditing={tableState.isEditing}
                  key={line.key}
                  line={line}
                  setLineData={(field:string, value:string | undefined) => setLineData(line,field,value)}
                  columns={columns}
                  focusColumnName={focusColumnName}
                  selectionState={compute_selection_state_for_row(line.key)}
                  showStandardAnswers={showStandardAnswers}
                  onCellClick={(column: Column) => onCellClick(column,line)}
                  cellKeyDown={cellKeyDown}
              />
            }
        )}
        <tr><td></td><td colSpan={columns.length}>
        { edit && (!tableState.focusLineKey || focusLine?.row) && 
          <Button className="px-8" onClick={e => addNewRow()} disabled={loading}>
                  aggiungi nuova riga
              </Button>}
        <Button onClick={refresh} disabled={refreshLoading} className="px-8 ml-8" variant="alert">
          Aggiorna
        </Button>
        </td></tr>
    </tbody>

    function effectFunction() {
      // shortcut: se non ci sono modifiche da fare, non fare niente!
      setTableState(prevTableState => {
        console.log(`TableBody useEffect on rows change: updating tableState with ${rows.length} rows`)
        // incoming rows we must:
        // * preserve the existing RowType objects where possible to avoid re-rendering
        // * remove rows that are no longer present
        // * add new rows
        // * preserve the order of existing rows, appending new rows at the end
        // * preserve new rows not yet saved to the database

        // put incoming rows into a dictionary for quick searching
        const rowFromId: Record<string,Row> = Object.fromEntries(rows.map(r => [r._id.toString(),r]))

        // estrae le righe nuove in modifica (ma dovrebbe essercene al più una...)
        const newTableLines: Line[] = []

        // componi il nuovo elenco delle righe
        let focusLineKey = prevTableState.focusLineKey  
        let focusFieldName = prevTableState.focusFieldName
        let lastClickedLineKey = prevTableState.lastClickedLineKey
        const lines: Line[] = []
        let modified_count = 0
        const deletedLineKeys: Set<string> = new Set<string>()

        // mantieni l'ordine pre-esistente, itera sulle righe vecchie
        for (const l of prevTableState.lines) {
          if (!l.row) {
            // riga nuova ancora non salvata (dovrebbe essere l'ultima dell'elenco) 
            newTableLines.push(l);
          } else {
            // riga pre-esistente, controlla se c'è ancora
            const id = l.row._id.toString()
            const incomingRow: Row|undefined = rowFromId[id]
            if (incomingRow) {
              // rimuovi dal dizionario per controllare alla fine cosa resta
              delete rowFromId[id]
              // confronta le Date convertendole in millisecondi
              if (incomingRow.updatedOn == l.row.updatedOn) {
                // la riga non è stata modificata
                lines.push(l);
              } else {
                console.log(`Row ${id} has been modified externally ${l.row.updatedOn} -> ${incomingRow.updatedOn}`);
                if (Object.keys(l.data).length>0) {
                  // UGH! la riga è stata modificata da un altro utente 
                  // mentre io pure la stavo modificando!
                  // ... ma forse l'altro utente sono io?
                  if (!l.saving) alert(`La riga che stai modificando è stata modificata da un altro utente. Controlla e ripeti le tue modifiche.`);
                  // r.data viene perso!
                }
                lines.push(newLine(incomingRow))
                modified_count++
              }
            } else {
              // la riga non c'è più... deve essere stata cancellata da qualcun'altro
              if (focusLineKey === l.key) {
                alert(`La riga che stai modificando è stata cancellata da un altro utente.`)
                focusLineKey = ''
                focusFieldName = ''
              }
              if (lastClickedLineKey === l.key) {
                // poco male...
                lastClickedLineKey = ''
              }
              deletedLineKeys.add(l.key)
            }
          }
        }

        if (modified_count=== 0 && deletedLineKeys.size===0 && Object.keys(rowFromId).length===0) {
            // non c'è stata nessuna modifica, 
            // questo evita di modificare lo stato senza motivo
            // SHORTCUT:
            console.log(`useEffect showcut!`)
            return prevTableState
        }
        console.log(`useEffect detected changes: modified_count=${modified_count} deleted_count=${deletedLineKeys.size} new_count=${Object.keys(rowFromId).length}`)
        
        // aggiungiamo le nuove righe in ingresso
        Object.values(rowFromId).forEach(r => {
          lines.push(newLine(r))
        })

        // aggiungiamo le righe nuove non salvate (una sola al più...)
        newTableLines.forEach(line => lines.push(line))

        // filtriamo la selezione
        const selectedLineKeys: Set<string> = deletedLineKeys.size === 0
          ? prevTableState.selectedLineKeys // non modificare lo stato se non serve (SHORTCUT!)
          : prevTableState.selectedLineKeys.difference(deletedLineKeys)
        
        return {
          lines,
          focusLineKey,
          focusFieldName,
          isEditing: prevTableState.isEditing && focusLineKey !== '' && focusFieldName !== '',
          selectedLineKeys,
          lastClickedLineKey,
        }
      })
    }

    function compute_selection_state_for_row(key: string): RowSelectionState {
        function allIds(key: string, shift: boolean): string[] {
            if (!tableState.lastClickedLineKey || !shift) return [key]
            const currentIndex = tableState.lines.findIndex(line => line.key === key)
            if (currentIndex === -1) return [key] // non dovrebbe accadere!
            let anchorIndex = tableState.lines.findIndex(line => line.key === tableState.lastClickedLineKey)
            if (anchorIndex === -1) anchorIndex = currentIndex
            const [start, end] = [Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex)]
            return tableState.lines.slice(start, end + 1).map(line => line.key)
        }
        function doSelect(shift: boolean) {
            const keys_set = new Set(allIds(key, shift))
            setTableState(prev => ({
                ...prev,
                selectedLineKeys: prev.selectedLineKeys.union(keys_set),
                lastClickedLineKey: key
            }))
        }
        function doDeselect(shift: boolean) {
            const keys_set = new Set(allIds(key, shift))
            setTableState(prev => ({
                ...prev,
                selectedLineKeys: prev.selectedLineKeys.difference(keys_set),
                lastClickedLineKey: key
            }))
        }
        return {
            isSelected: tableState.selectedLineKeys.has(key),
            doSelect, doDeselect
        }
    }
  }

