import { Dispatch, KeyboardEvent, SetStateAction, useEffect } from "react"
import { Row, Sheet, useAddRowMutation, useDeleteRowMutation, usePatchRowMutation } from "../graphql/generated"
import TableRow, { RowSelectionState } from "./TableRow"
import Schema from "../lib/schema/Schema"
import { Column } from "./Table"
import { Data } from "../lib/models"
import { gql, StoreObject, useMutation } from "@apollo/client"
import { Field } from "../lib/schema/fields"
import Button from "./Button"
import next from "next"

export type TableBodyInput = {
    schema: Schema,
    sheet: Sheet,
    showStandardAnswers: boolean,
}

export type Line = {
    key: string,
    row: Row | undefined, // database row, undefined for new rows
    data: Data, // modified unsaved data
    saving: boolean, // async saving in progress
    error: string, // saving error or ''
}

function newLine(row?: Row, data: Data = {}) : Line {
  return {
    key: row ? row._id.toString() : Date.now().toString(),
    row,
    data,
    saving: false,
    error: ''
  };
}

export type TableState = {
  lines: Line[], // tutte le righe della tabella, comprese quelle nuove non ancora salvate
  focusLineKey: string, // riga attualmente in modifica o ''
  focusFieldName: string, // colonna attualmente in modifica o ''
  selectedLineKeys: Set<string>, // righe selezionate
  lastClickedLineKey: string, // ultima riga cliccata (per selezione con shift) potrebbe non esistere più...
}

export const EMPTY_TABLE_STATE: TableState = {
    lines: [],
    focusLineKey: '',
    focusFieldName: '',
    selectedLineKeys: new Set<string>(),
    lastClickedLineKey: ''
}

export default function TableBody({edit, sheet, schema, rows, columns, tableState, setTableState, showStandardAnswers
}: {
    edit: boolean,
    sheet: Sheet,
    schema: Schema,
    rows: Row[],
    columns: Column[],
    tableState: TableState,
    setTableState: Dispatch<SetStateAction<TableState>>,
    showStandardAnswers: boolean,
}) {
    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRowMutation() // useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRowMutation() // usePatchRow()
    const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRowMutation() // useDeleteRow()
    const loading = addLoading || patchLoading || deleteLoading
    const error = addError || patchError || deleteError
    const dismissErrors = () => { addReset(); patchReset(); deleteReset(); }

    /*
    const setModifiedData = useCallback((field: string, value: string | undefined) => {
      // se value è undefined tolgo il campo dal record
      // altrimenti lo aggiungo/aggiorno
      setRowModifiedData(prev => {
        if (value === undefined) {
          const {[field]: _, ...data} = prev
          return data
        } else {
          return {...prev, [field]: value}
        }
      })
    }, [setRowModifiedData])
    */

    useEffect(() => {
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
          selectedLineKeys,
          lastClickedLineKey,
        }
      })
    }, [rows, setTableState]);

    const focusLine = tableState.lines.find(l => l.key === tableState.focusLineKey)

    return <tbody onKeyDown={onKeyDown}>
        {tableState.lines.map(line => {
            const focusColumnName=tableState.focusLineKey === line.key ? tableState.focusFieldName : ''
            if (tableState.focusLineKey === line.key && error) {
              return <tr key={line.key} className="error" onClick={() => dismissErrors()}><td colSpan={columns.length + 1}>{error.message}</td><td></td></tr>
            }
            return <TableRow
                edit={edit}
                schema={schema}
                key={line.key}
                line={line}
                setLineData={(field:string, value:string | undefined) => setLineData(line,field,value)}
                columns={columns}
                focusColumnName={focusColumnName}
                selectionState={compute_selection_state_for_row(line.key)}
                showStandardAnswers={showStandardAnswers}
                onCellClick={(column: Column) => onCellClick(column,line)}
            />}
        )}
        { edit && (!tableState.focusLineKey || focusLine?.row) 
          && <tr><td></td><td colSpan={columns.length}>
              <Button onClick={e => addNewRow()} disabled={loading}>
                  aggiungi nuova riga
              </Button>
          </td></tr>}
    </tbody>

    function setLineData(line: Line, field: string, value: string|undefined) {
      setTableState(prev => ({
        ...prev,
        // only change lines:
        lines: prev.lines.map(l => l===line 
          ? {
            ...l,
            data: dataSetter(l.data, field, value)
          } 
          : l)
      }))

      function dataSetter(prev: Data, field: string, value:string|undefined) {
          if (value === undefined) {
            // remove field
            const {[field]:_, ...rest} = prev;
            return prev;
          } else {
            return {...prev, [field]: value}
          }
      }
    }
    
    // aggiunge una nuova riga vuota in fondo alla tabella
    // e ci mette il focus
    function addNewRow() {
        saveLineIfNeeded(focusLine)
        
        setTableState(prev => {
            // aggiungi una nuova riga
            const line = newLine()
            const firstEditableColumn = columns.find(col => (col instanceof Field && !col.hidden && col.editable)) as Field | undefined
            const focusFieldName = firstEditableColumn?.name || ''
            const state = {
              ...prev,
              lines: [...prev.lines, line]
            }
            return moveFocusToSetter(state, line, focusFieldName)
        })
    }

    // sposta il focus nella tabella
    // avvia il salvataggio della riga che perde il focus, se serve
    function moveFocusToSetter(prev: TableState, line: Line|undefined, fieldName: string): TableState {
        console.log(`moveFocusToSetter: from lineKey=${prev.focusLineKey} to lineKey=${line?.key} field=${fieldName}`)
        
        // metti il focus sulla nuova riga
        const focusLineKey = line?.key || ''

        if (focusLineKey === prev.focusLineKey && fieldName === prev.focusFieldName) {
          console.log(`moveFocusToSetter: no change in focusLineKey`)
          return prev // SHORTCUT!
        }
        
        const focusFieldName = fieldName
        const lines: Line[] = prev.lines
        return {
            ...prev,
            lines,
            focusLineKey,
            focusFieldName,
        }
    }

    function cancelUnsavedModification() {
        const focusLineKey = tableState.focusLineKey
        if (!focusLine) return
        if (focusLine.data.keys.length === 0 && !focusLine.error) {
            setTableState(prev => ({
                ...prev,
                focusLineKey: '',
                focusFieldName: '',
            }))
            return
        }
        setTableState(prev => {
            const newLine = {
                ...focusLine,
                data: {},
                error: ''
            }
            return {
              ...prev,
              focusLineKey: '',
              focusFieldName: '',
              lines: prev.lines.map(l => l === focusLine ? newLine : l)
            }
        })
    }

    function pressEnter() {
      console.log(`TableBody onKeyDown Enter pressed`)
      if (!focusLine) return
      const lines = tableState.lines
      const row_index = lines.indexOf(focusLine)
      if (row_index < 0) return // non dovrebbe succedere!
      const editable_columns = columns.filter(col => (col instanceof Field && !col.hidden && col.editable))
      if (row_index + 1 === lines.length) {
        // era l'ultima riga della tabella
        if (editable_columns.length >0) {
          console.log(`move focus to new row`)
          addNewRow()
        } else {
          // non ci sono colonne da modificare
          // togli il focus
          console.log(`no editable columns, removing focus`)
          saveLineIfNeeded(focusLine)
          setTableState(prev => moveFocusToSetter(prev, undefined, ''))
        }
      } else {
        // trovo la riga successiva
        const newFocusLine = lines[row_index + 1]
        // mi sposto a sinistra finché ci sono celle vuote
        const keys = editable_columns.map(col => col.name)
        const values = keys.map(key => newFocusLine.data[key])
        let i = keys.indexOf(tableState.focusFieldName)
        if (i<=0) i=0;
        while(i>0 && (values[i] || '') === '' && (values[i-1] || '') === '') i--; // mi sposto a sinistra finché ci sono campi vuoti
        if (keys[i]) {
          // muovo il focus
          console.log(`move focus to line ${newFocusLine.key} field ${keys[i]}`)
          saveLineIfNeeded(focusLine) // CORRETTO!
          setTableState(prev => moveFocusToSetter(prev, newFocusLine, keys[i]))
        } else {
          // tolgo il focus perché non ci sono colonne modificabili
          console.log(`no editable columns in next row, removing focus`)
          saveLineIfNeeded(focusLine) // CORRETTO!
          setTableState(prev => moveFocusToSetter(prev, undefined, ''))
        }
      }
    }

    function pressArrowDownOrUp(down: boolean) {
      console.log(`TableBody onKeyDown ArrowDown pressed`)
      if (!focusLine) return
      const lines = tableState.lines
      const row_index = lines.indexOf(focusLine)
      if (row_index < 0) return // non dovrebbe succedere!

      const next_index = down ? row_index + 1 : row_index - 1
      if (next_index < 0) return
      if (next_index >= lines.length) return

      // trovo la riga successiva
      const newFocusLine = lines[next_index]

      // muovo il focus
      console.log(`move focus to line ${newFocusLine.key}`)
      saveLineIfNeeded(focusLine)
      setTableState(prev => moveFocusToSetter(prev, newFocusLine, prev.focusFieldName))
    }

    function onKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
      const focusLineKey = tableState.focusLineKey
      if (edit // stiamo modificando il foglio 
        && focusLine // c'è una riga in modifica
        && e.key === "Enter"
      ) {
        e.preventDefault()
        e.stopPropagation()
        pressEnter()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // esco dalla modalità modifica
        const focusLine = tableState.lines.find(l => l.key === focusLineKey)
        if (focusLine && focusLine.data.keys.length>0) {
            if (!confirm("Ci sono modifiche non salvate su questa riga. Vuoi scartarle?")) return
        } 
        cancelUnsavedModification();
      }
      if (e.key === "ArrowDown" && focusLine) {
        e.preventDefault();
        e.stopPropagation();
        pressArrowDownOrUp(true);
        return;
      }
      if (e.key === "ArrowUp" && focusLine) {
        e.preventDefault();
        e.stopPropagation();
        pressArrowDownOrUp(false);
        return;
      }
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

    async function onCellClick(column: Column, line: Line) {
        console.log(`TableBody onCellClick lineKey=${line.key} column=${column.name}`)
        if (line.key !== tableState.focusLineKey) saveLineIfNeeded(focusLine);
        setTableState(prev => moveFocusToSetter(prev, line, column.name))
    }

    // avvia il salvataggio asincrono della linea
    // restituisce una Line con attributo saving appropriato
    // alla fine del salvataggio asyncrono verrà aggiornato tableState
    function saveLineIfNeeded(line: Line|undefined) {
        if (line === undefined) return 
        const data = line.data
        if (Object.keys(data).length === 0 || line.saving) {
            return
        } else {
            console.log(`saveLineIfNeeded: saving line ${line.key} with data`, data)
            const row = line.row
            const key = line.key  
            if (row) {
                saveRow(row, data) // async progress
            } else {
                createRow(key, data) // async progress
            }
            setTableState(prev => {
              let modified_count = 0
              const lines: Line[] = prev.lines.map(l => {
                  if (l.key === key) {
                      modified_count++
                      return {
                          ...l,
                          saving: true,
                          error: ''
                      }
                  } else {
                      return l
                  }
            })

            if (modified_count === 0) return prev // SHORTCUT!

            return {
                  ...prev,
                  lines
              }
            })
        }
    }

    async function saveRow(row: Row, data: Data) {
        console.log(`saving row ${row._id} with data`, data)
        
        function updateLineState(update: Partial<Line>) {
            setTableState(prev => {
              console.log(`updateLineState called in saveRow`)
              const lines: Line[] = prev.lines.map(line => line.row === row 
                  ? {...line, ...update}
                  : line)
              return {...prev, lines }
            })
        }

        const res = await patchRow({variables: {
            _id: row._id,
            updatedOn: row.updatedOn || new Date(),
            data,
        }})
        console.log('saveRow result', res)

        const errors = res.errors
        const r: Row | undefined | null = res.data?.patchRow
        if (errors) {
            updateLineState({saving: false,  error: errors.map(e=>`${e}`).join(', ')})
            return
        } 
        if (!r) {
            updateLineState({saving: false, error: 'connection error'})
            return
        }
        // ha salvato!
        updateLineState({
            row: r,
            data: {},
            saving: false,
            error: ''
        })
    }

    async function createRow(lineKey: string, data: Data) {
        function updateLineState(update: Partial<Line>) {
            setTableState(prev => {
              const lines: Line[] = prev.lines.map(line => line.key === lineKey 
                  ? {...line, ...update}
                  : line)
              return {...prev, lines }
            })
        }

        const res = await addRow({variables: {
            sheetId: sheet._id,
            data: data,
        }})

        const row: Row | undefined | null = res.data?.addRow
        const errors = res.errors
        if (errors) {
            updateLineState({saving: false, error: errors.map(e => `${e}`).join(', ') })
            return
        }
        if (!row) {
            updateLineState({saving: false, error: 'connection error'})
            return
        }
        updateLineState({
            row,
            data: {},
            saving: false,
            error: ''
        })
    }
}


export const ADD_ROW = gql`
  mutation addRow($sheetId: ObjectId!, $data: Data!) {
    addRow(sheetId: $sheetId, data: $data) {
      _id
      error
      data
      createdOn
      createdBy
      updatedOn
      updatedBy
    }
  }
`

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!) {
    patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
      _id
      __typename
      createdOn
      createdBy
      updatedOn
      updatedBy
      error
      data
    }
  }
`

const DELETE_ROW = gql`
  mutation DeleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
  }
`

const DELETE_ROWS = gql`
  mutation DeleteRows($ids: [ObjectId!]!) {
    deleteRows(ids: $ids)
  }
`

export function useAddRow() {
  return useMutation<{ addRow: Row }>(ADD_ROW, {
    update(cache, { data }) {
      if (!data) return      
      const newRow = data.addRow // Assumendo che la mutazione restituisca la nuova riga          
      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            // Controlla se la riga è già presente per evitare duplicati
            if (existingRows.some((row:StoreObject) => readField("_id", row) === newRow._id)) {
              return existingRows
            }
            return [...existingRows, newRow]
          },
        },
      })
    }
  })
}

export function usePatchRow() {
  return useMutation<{ patchRow: StoreObject }>(PATCH_ROW, {
    update(cache, { data }) {
      console.log(`patchRow update cache`)
      const updatedRow = data?.patchRow
      if (!updatedRow) return

      cache.modify({
        id: cache.identify(updatedRow),
        fields: Object.fromEntries(
          Object.entries(updatedRow).map(([key, value]) => [key, () => value])
        ),
      })
    }
  })
}

export function useDeleteRow() {
  return useMutation<{ deleteRow: string }>(DELETE_ROW, {
    update(cache, { data }) {
      const deletedId = data?.deleteRow
      if (!deletedId) return

      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            return existingRows.filter((row:StoreObject) => readField("_id", row) !== deletedId);
          },
        },
      })
    }
  })
}

export function useDeleteRows() {
  return useMutation<{ deleteRows: number }>(DELETE_ROWS, {
    update(cache, { data }, { variables }) {
      const deletedCount = data?.deleteRows
      if (!deletedCount || !variables) return

      const idsToDelete = variables.ids

      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            return existingRows.filter((row:StoreObject) => {
              const rowId = readField("_id", row)
              return !idsToDelete.some((id: unknown) => id?.toString() === rowId?.toString())
            });
          },
        },
      })
    }
  })
}
