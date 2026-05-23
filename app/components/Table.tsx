"use client"

import { Row, Sheet, useAddRowMutation, useDeleteRowMutation, usePatchRowMutation } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import useProfile from '../lib/useProfile'
import TableActions from './TableActions'
import { useCheckboxesState } from './TableCheckboxes'
import TableBody from './TableBody'
import TableHeader from './TableHeader'
import { Dispatch, KeyboardEvent, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { myTimestamp } from '../lib/util'
import { Data } from '../lib/models'
import { gql } from '@apollo/client'

export type SortCriterium = {
    field: string|Field,
    direction: number
}

export type RowField = {
    name: string,
    label: string
    value_formatter?: ({row, value}: {row: Row, value: string}) => string
}

export type Column = Field | RowField

function rowModified(row: Row): boolean {
    return row?.updatedOn && row?.updatedOn !== row?.createdOn
}

const ADDITIONAL_COLUMNS: RowField[] = [
    {
        name: 'createdOn', 
        label: 'istante creazione',
        value_formatter: ({row, value}) => value ? myTimestamp(value) : ''
    },
    {
        name: 'createdBy', 
        label: 'creato da'
    },
    {
        name: 'updatedOn', 
        label: 'istante modifica',
        value_formatter: ({row, value}) => (value && rowModified(row)) ? myTimestamp(value) : ''
    },
    {
        name: 'updatedBy', 
        label: 'aggiornato da',
        value_formatter: ({row, value}) => (value && rowModified(row)) ? value : ''
    },
]

export type Line = {
    key: string,
    row: Row | undefined, // database row, undefined for new rows
    data: Data, // modified unsaved data
    saving: boolean, // async saving in progress
    error: string, // saving error or ''
}

export function newLine(row?: Row, data: Data = {}) : Line {
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
  lastCsvDownload?: Date, // istante dell'ultimo download CSV
  inputFocus: boolean, // siamo in modalità inserimento (vs navigazione)
}

export const EMPTY_TABLE_STATE: TableState = {
    lines: [],
    focusLineKey: '',
    focusFieldName: '',
    selectedLineKeys: new Set<string>(),
    lastClickedLineKey: '',
    lastCsvDownload: undefined,
    inputFocus: false,
}

export default function Table({edit, standardAnswers, rows, sheet, refresh, refreshLoading, lastCsvDownload, csvDownload, setCsvImport, adminEditMode}: {
    edit: boolean,
    standardAnswers: boolean,
    rows: Row[],
    sheet: Sheet,
    refresh?: () => Promise<void>,
    refreshLoading?: boolean,
    lastCsvDownload?: Date,
    csvDownload: (rows: Row[], standardAnswers: boolean) => void,
    setCsvImport: Dispatch<SetStateAction<boolean>>,
    adminEditMode: boolean,
}) {
    const schema = schemas[sheet.schema]
    const profile = useProfile();
    const userHasSheetAdminPrivileges = profile?.isAdmin || sheet.ownerId.toString() === profile?._id?.toString() || sheet.permissions.some(p => p.role === 'admin' && p.email === profile?.email)
    const [checkboxesState, setCheckboxesState] = useCheckboxesState();
    const [tableState, setTableState ] = useState<TableState>(EMPTY_TABLE_STATE);
    const [sortCriterium, setSortCriterium] = useState<SortCriterium>({field: '', direction: 1});
    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRowMutation() // useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRowMutation() // usePatchRow()
    const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRowMutation() // useDeleteRow()
    const loading = addLoading || patchLoading || deleteLoading
    const error = addError || patchError || deleteError
    const dismissErrors = () => { addReset(); patchReset(); deleteReset(); }
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date()) // ultima sincronizzazione con il server
    const [lastAlive, setLastAlive] = useState<Date>(new Date()) // ultima interazione con l'utente.
    const [directInput, setDirectInput] = useState<boolean>(false);

    useEffect(() => {setTableState(prev => ({...prev, lastCsvDownload}))}, [lastCsvDownload, setTableState])
    useEffect(() => {setLastUpdate(new Date())}, [rows, setLastUpdate])
    useEffect(effectFunction, [rows, setTableState]);

    const columns: Column[] = useMemo(() => [
        ...(checkboxesState.showAdditionalColumns ? ADDITIONAL_COLUMNS : []),
        ...schema.fields.filter(f => checkboxesState.showHiddenColumns || !f.hidden)
    ], [checkboxesState, schema.fields]);

    const focusLine = useMemo(
        () => edit ? tableState.lines.find(l => l.key === tableState.focusLineKey) : undefined,
        [edit, tableState.lines, tableState.focusLineKey]
    );    
    const focusColumn = useMemo(
        () => focusLine ? columns.find(c => c.name === tableState.focusFieldName) : undefined,
        [focusLine, columns, tableState.focusFieldName]
    );
    const focusField = focusColumn instanceof Field ? focusColumn : undefined

    useEffect(() => {
        // avvia un timer per il salvataggio automatico della riga in modifica
        const intervalId = setInterval(() => {
            setTableState(prev => {
                // console.log(`automatic save...`);
                saveLineIfNeeded(focusLine)
                return prev
        })
        }, 5000)
        return () => clearInterval(intervalId);
    }, [focusLine,lastAlive,setTableState]);


    if (!schema) {
        return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
    }

    return <div className="table-container">
        <div className="table-header hide-print">
            <TableActions 
                sheet={sheet} schema={schema} checkboxesState={checkboxesState} setCheckboxesState={setCheckboxesState} userHasSheetAdminPrivileges={userHasSheetAdminPrivileges} tableState={tableState} setTableState={setTableState} 
                standardAnswers={standardAnswers}
                csvDownload={(rows) => csvDownload(rows, standardAnswers)} setCsvImport={setCsvImport} edit={edit} profile={profile||undefined}/>
        </div>
        <div className="table-scroll-container" tabIndex={0} onKeyDown={onKeyDown}>
            <table className="my-table">
                <TableHeader 
                    schema={schema}
                    columns={columns} 
                    doSortRows={doSortRows} sortCriterium={sortCriterium} setSortCriterium={setSortCriterium}
                    allSelected={tableState.selectedLineKeys.size === tableState.lines.length}
                    selectAll={() => selectAll()}
                    selectNone={() => setTableState(prev => ({...prev,selectedLineKeys: new Set()}))}
                    />
                <TableBody 
                    edit={edit}
                    columns={columns}
                    sheet={sheet}
                    schema={schema}
                    tableState={tableState}
                    setTableState={setTableState}
                    directInput={directInput} setDirectInput={setDirectInput}
                    showStandardAnswers={standardAnswers}
                    refresh={refresh}
                    refreshLoading={refreshLoading}
                    error={error}
                    dismissErrors={dismissErrors}
                    onCellClick={(column: Column, line: Line) => moveFocusTo(column, line)}
                    addNewRow={addNewRow}
                    loading={loading}
                    setLineData={setLineData}
                    cellKeyDownHandler={cellKeyDownHandler}
                    adminEditMode={adminEditMode}
                />
            </table>
        </div>
    </div>
    
    function effectFunction() {
      // shortcut: se non ci sono modifiche da fare, non fare niente!
      setTableState(prevTableState => {
        // console.log(`TableBody useEffect on rows change: updating tableState with ${rows.length} rows`)
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
                // console.log(`Row ${id} has been modified externally ${l.row.updatedOn} -> ${incomingRow.updatedOn}`);
                if (Object.keys(l.data).length>0) {
                  // UGH! la riga è stata modificata da un altro utente 
                  // mentre io pure la stavo modificando!
                  // ... ma forse l'altro utente sono io?
                  if (!l.saving) alert(`La riga che stai modificando è stata modificata. Controlla e ripeti le tue modifiche.`);
                  // r.data viene perso!
                }
                lines.push(newLine(incomingRow))
                modified_count++
              }
            } else {
              // la riga non c'è più... deve essere stata cancellata da qualcun'altro
              if (focusLineKey === l.key) {
                alert(`La riga che stai modificando è stata cancellata.`)
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
            // console.log(`useEffect showcut!`)
            return prevTableState
        }
        // console.log(`useEffect detected changes: modified_count=${modified_count} deleted_count=${deletedLineKeys.size} new_count=${Object.keys(rowFromId).length}`)

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
        
        const inputFocus = !!(prevTableState.inputFocus && focusLineKey && focusFieldName)

        return {
          lines,
          focusLineKey,
          focusFieldName,
          selectedLineKeys,
          lastClickedLineKey,
          inputFocus,
        }
      })
    }

    function selectAll() {
        setTableState(prev => ({
            ...prev,
            selectedLineKeys: new Set<string>(prev.lines.map(line => line.key))
        }))
    }

    function doSortRows(field: Field|string, direction: number) {
        if (field instanceof Field) {
            const sort_criteria = [{ campo: field, direzione: direction }]
            setTableState(prev => {
                const prev_lines = prev.lines
                const lines = tableOrdina(sort_criteria, prev_lines)
                if (!prev_lines.some((line, i) => line !== lines[i])) {
                    return prev // shortcut: don't modify the array
                }
                return {...prev, lines}
            })
        } else {
            setTableState(prev => {
                const lines = [...prev.lines]
                lines.sort((a,b) => {
                    if (!a.row) return -1
                    if (!b.row) return 1
                    const aValue = a.row[field as keyof Row];
                    const bValue = b.row[field as keyof Row];
                    if (aValue < bValue) return -direction;
                    if (aValue > bValue) return direction;
                    return 0;
                })
                if (!lines.some((line,i)=> line !== prev.lines[i])) {
                    return prev // shortcut
                }
                return {...prev,lines}
            })
        }
    }

    function onKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
        // console.log(`Table onKeyDown for key: ${e.key}`);
        const focusLineKey = tableState.focusLineKey
        const inputFocus = tableState.inputFocus
        setLastAlive(new Date())
        if (!edit) return
        // salva cella in modifica
        if (e.key === "Enter" && focusField && inputFocus) {
            e.preventDefault()
            e.stopPropagation()
            saveLineAndProceedToNext()
        } else if ((e.key === "Enter" || e.key === "F2") && !inputFocus && focusField) {
            setTableState(prev => ({...prev, inputFocus: true}))
        } else if ((e.key === "Delete" || e.key === "Backspace") && !inputFocus && focusLine) {
            setValueInFocusCell('')
            // setTableState(prev => ({...prev, inputFocus: true}))
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !inputFocus && focusLine && focusField) {
            // alert(`Inizio modifica della cella. Premi ESC per annullare.`)
            setTableState(prev => ({...prev, inputFocus: true}))
            let char = e.key
            if (focusField.type === 'choice-answer') {
                char = choiceAnswerCharacterTransform(char)
            }
            setValueInFocusCell(char)
            setDirectInput(true);
            // cellKeyDownHandler(e);
            e.preventDefault();
            e.stopPropagation();
        } else if (e.key === "Escape" && focusField && inputFocus) {
            e.preventDefault();
            e.stopPropagation();
            // esco dalla modalità modifica
            const focusLine = tableState.lines.find(l => l.key === focusLineKey)
            // salvo contenuto della riga
            saveLineIfNeeded(focusLine);
            // esco dalla modalità modifica
            setTableState(prev => ({...prev, inputFocus: false}))
            /*
            if (focusLine && Object.keys(focusLine.data).length > 0) {
                if (!confirm("Ci sono modifiche non salvate su questa riga. Vuoi scartarle?")) {
                    return
                }
            } 
            cancelUnsavedModification(inputFocus);
            */
        } else if (e.key === "ArrowDown" && focusLine) {
            e.preventDefault();
            e.stopPropagation();
            moveDownOrUp(1);
        } else if (e.key === "ArrowUp" && focusLine) {
            e.preventDefault();
            e.stopPropagation();
            moveDownOrUp(-1);
        } else if (e.key === "PageDown" && focusLine) {
            e.preventDefault();
            e.stopPropagation();
            moveDownOrUp(e.shiftKey ? 1000 : 10);
        } else if (e.key === "PageUp" && focusLine) {
            e.preventDefault();
            e.stopPropagation();
            moveDownOrUp(e.shiftKey ? -1000 : -10);
        } else if (e.key === 'ArrowLeft') {
            if (moveRightOrLeft(e.shiftKey ? -5 : -1)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        } else if (e.key === 'ArrowRight') {
            if (moveRightOrLeft(e.shiftKey ? 5 : 1)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        } else if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (moveRightOrLeft(-1)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          } else {
            if (moveRightOrLeft(1)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        } else if (e.key === "Home") {
            e.preventDefault();
            e.stopPropagation();
            moveRightOrLeft(-1000);
        } else if (e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            moveRightOrLeft(1000);
        }

        function setValueInFocusCell(s: string) {
            if (focusLine && focusField) {
                setLineData(focusLine, focusField.name, s)
            }
        }
    }

    function cellKeyDownHandler(e: KeyboardEvent<HTMLInputElement>|KeyboardEvent<HTMLTableSectionElement>) {
        // console.log("cellKeyDownHandler called");
        const key = e.key;
        const input = e.currentTarget

        if (!edit) return;

        // input può essere undefined perché al primo 
        // carattere digitato non c'è ancora l'input nella cella
        // è però garantito che il primo carattere non è speciale

        // non c'è una riga con il focus
        if (!focusLine) return

        // la colonna con il focus non è un campo modificabile
        if (!(focusField instanceof Field)) return

        const field: Field = focusField;
        const oldValue = focusLine.row ? (focusLine.row.data[field.name] || '') : ''

        function setValue(value: string|undefined) {
            setTableState(prev => {
                return {
                    ...prev,
                    // only change lines:
                    lines: prev.lines.map(l => l===focusLine 
                        ? {
                        ...l,
                        data: dataSetter(l.data, field.name, value)
                        } 
                        : l)
                }
            })
        }

        // console.log(`cellKeyDown with key: ${key}`);
        if (key === "Enter" || key === "Escape" 
            || key === "Tab" || key === "ArrowUp" 
            || key === "ArrowDown") {
            e.preventDefault()
            // viene gestito dall'handler superiore in Table
            return
        }
        let isAtStart = true
        let isAtEnd = true
        if (input instanceof HTMLInputElement) {
            const cursorPos = input.selectionStart || 0
            const cursorEnd = input.selectionEnd || 0
            isAtStart = cursorPos === 0 && cursorEnd === 0
            isAtEnd = cursorPos === input?.value.length && cursorEnd === input.value.length
        }

        if (field.type === 'choice-answer') {
            const newValue = choiceAnswerKeyDownHandler(e);
            if (newValue !== undefined) {
                e.preventDefault()
                setValue(newValue === oldValue ? undefined : newValue)
                return
            }
        } else if (key === "Backspace" && isAtStart) {
            moveRightOrLeft(-1)
            e.stopPropagation()
            return
        } else if ((key === "ArrowLeft" && isAtStart)
            || (key === "ArrowRight" && isAtEnd)) {
            // fai gestire il movimento di focus alla tabella
            e.preventDefault()
            return
        } else if (key === "ArrowLeft" || key === "ArrowRight") {
            // evita che le componenti superiori intercettino l'evento
            e.stopPropagation()
        } else if (field.type === 'date') {
            const newValue = dateKeyDownHandler(e)
            if (newValue !== undefined) {
                e.preventDefault()
                setValue(newValue === oldValue ? undefined : newValue)
                return
            }
        }
    }

    // handler specifico per i campi di tipo 'date'
    function dateKeyDownHandler(e: KeyboardEvent<HTMLInputElement>|KeyboardEvent<HTMLTableSectionElement>) {
        let key = e.key
        const input = e.currentTarget
        if (key === ' ' || key==='.') key = '/'

        if (key >= '0' && key <= '9' || key === '/') { 
        let cursorPos = 0
        let cursorEnd = 0
        if (input instanceof HTMLInputElement) {
            cursorPos = input?.selectionStart || 0    
            cursorEnd = input?.selectionEnd || 0
            let value = input?.value || ''
                // rimpiazza eventuali '|' con '/'
                value = value.replace(/\|/g, '/')

                // inserisci carattere e '|' come cursore
                value = value.slice(0, cursorPos) + key + '|' + value.slice(cursorEnd)

                // sostituisci eventuali doppie barre con una sola barra
                value = value.replace(/\/+/g, '/')
                value = value.replace(/\/\|\//g, '/|')

                // Aggiungi una barra se value = "gg|" o "gg/mm|"
                if (value.match(/^\d{2}\|$/) || value.match(/^\d{2}\/\d{2}\|$/) ) {
                    value = value.replace('|', '/|')
                }

                cursorPos = value.indexOf('|')
                value = value.replace('|', '')

            // Imposta la posizione del cursore
            setTimeout(() => {
                const input = document.activeElement as HTMLInputElement
                if (input) {
                    input.setSelectionRange(cursorPos, cursorPos)
                }
            }, 0)
                return value
            }
        }
        return undefined
    }

    // handler specifico per i campi di tipo 'choice-answer' (singolo carattere)
    function choiceAnswerKeyDownHandler(e: KeyboardEvent<HTMLInputElement>|KeyboardEvent<HTMLTableSectionElement>) {
        const key = e.key
        if (key === "ArrowLeft" || key === "ArrowRight") {
            // lascia che il movimento venga gestito da TableRow
            e.preventDefault()
            return
        } else if (key === "Delete") {
            return ''
        } else if (key === "Backspace") {
            setTimeout(() => moveRightOrLeft(-1),0)
            return ''
        } else if (key.length === 1) {
            // Se è un singolo carattere (non un tasto speciale come Shift, Ctrl, etc.)
            const char = choiceAnswerCharacterTransform(key)
            return char // Sostituisci il valore
        } else {
            return undefined;
        }
    }

    function choiceAnswerCharacterTransform(char:string) {
        char = char.toUpperCase()
        if (char === '0' || char === ' ') char = '-'
        else if (char === '1') char = 'A'
        else if (char === '2') char = 'B'
        else if (char === '3') char = 'C'
        else if (char === '4') char = 'D'
        else if (char === '5') char = 'E'
        else if (char === '9') char = 'X'
        if (! "ABCDEX-".includes(char)) char = ' '
        else setTimeout(() => moveRightOrLeft(1), 0);      
        return char // Sostituisci il valore
    }

    function moveFocusTo(column: Column, line: Line) {
        if (!edit) return;
        if (line.key !== tableState.focusLineKey) saveLineIfNeeded(focusLine);
        const sameCell = line.key === tableState.focusLineKey && column.name === tableState.focusFieldName
        if (sameCell && !tableState.inputFocus) {
            // entriamo in modalità input
            setTableState(prev => ({...prev, inputFocus: true}))
            return
        }
        setTableState(prev => stateMoveFocusTo(prev, line, column.name))
    }

    function columnCanReceiveFocus(column: Column): boolean {
        const showHiddenColumns = checkboxesState.showHiddenColumns
        if (column instanceof Field) {
            return column.editable && (showHiddenColumns || !column.hidden)
        } else return false
    }

    function columnIsEditable(column: Column): boolean {
        const showHiddenColumns = checkboxesState.showHiddenColumns
        if (column instanceof Field) {
            return column.editable && (showHiddenColumns || !column.hidden)
        } else return false
    }

    // aggiunge una nuova riga vuota in fondo alla tabella
    // e ci mette il focus
    function addNewRow() {
        const showHiddenColumns = checkboxesState.showHiddenColumns
        saveLineIfNeeded(focusLine)
        
        setTableState(prev => {
            // aggiungi una nuova riga
            const line = newLine()
            const firstEditableColumn = columns.find(columnIsEditable) as Field | undefined
            const focusFieldName = firstEditableColumn?.name || ''
            if (focusLine) {
                // inserisci campi precompilati
                for (const col of columns) {
                    if (col instanceof Field && col?.precompileValue) {
                        const value = focusLine?.data[col.name] || focusLine?.row?.data[col.name] || ''
                        if (value) {
                            line.data[col.name] = value
                        }
                    }
                }
            }
            const state = {
                ...prev,
                lines: [...prev.lines, line]
            }
            return stateMoveFocusTo(state, line, focusFieldName)
        })
    }

    function cancelUnsavedModification(inputFocus: boolean) {
        if (!focusLine) return
        if (Object.keys(focusLine.data).length === 0 && !focusLine.error) {
            if (inputFocus) {
                setTableState(prev => ({
                    ...prev,
                    inputFocus: false,
                }))
            } else {
                setTableState(prev => ({
                    ...prev,
                    focusLineKey: '',
                    focusFieldName: '',
                }))
            }
            
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

    function saveLineAndProceedToNext() {
        if (!focusLine) return
        const lines = tableState.lines
        const row_index = lines.indexOf(focusLine)
        if (row_index < 0) return // non dovrebbe succedere!
        const visible_columns = columns.filter(columnCanReceiveFocus)
        if (row_index + 1 === lines.length) {
            // era l'ultima riga della tabella
            if (visible_columns.length >0) {
                // console.log(`move focus to new row`)
                addNewRow()
            } else {
                // non ci sono colonne da modificare
                // togli il focus
                // console.log(`no editable columns, removing focus`)
                saveLineIfNeeded(focusLine)
                setTableState(prev => stateMoveFocusTo(prev, undefined, ''))
            }
        } else {
            // trovo la riga successiva
            const newFocusLine = lines[row_index + 1]

            // indietreggio sulle colonne se sono vuote
            // mi sposto a sinistra finché ci sono celle vuote
            const keys = visible_columns.map(col => col.name)
            const values = keys.map(key => newFocusLine.data[key] || newFocusLine.row?.data[key] || '')
            let i = keys.indexOf(tableState.focusFieldName)
            if (i>=0) {
                while(i>0 && (values[i] || '') === '' && (values[i-1] || '') === '') i--; // mi sposto a sinistra finché ci sono campi vuoti
                if (keys[i]) {
                    // muovo il focus
                    // console.log(`move focus to line ${newFocusLine.key} field ${keys[i]}`)
                    saveLineIfNeeded(focusLine) // CORRETTO!
                    setTableState(prev => stateMoveFocusTo(prev, newFocusLine, keys[i]))
                } else {
                    // tolgo il focus perché non ci sono colonne modificabili
                    // console.log(`no editable columns in next row, removing focus`)
                    saveLineIfNeeded(focusLine) // CORRETTO!
                    setTableState(prev => stateMoveFocusTo(prev, undefined, ''))
                }
            }
        }
    }

    function moveDownOrUp(down: number) {
        if (!focusLine) return
        const lines = tableState.lines
        const row_index = lines.indexOf(focusLine)
        if (row_index < 0) return // non dovrebbe succedere!

        let next_index = row_index + down
        if (next_index < 0) next_index = 0
        if (next_index >= lines.length) next_index = lines.length -1
        if (row_index === next_index) return

        // trovo la riga successiva
        const newFocusLine = lines[next_index]

        // muovo il focus
        // console.log(`move focus to line ${newFocusLine.key}`)
        saveLineIfNeeded(focusLine)
        setTableState(prev => stateMoveFocusTo(prev, newFocusLine, prev.focusFieldName))
        setTableState(prev => ({...prev, inputFocus: false}))
    }

    function moveRightOrLeft(n: number) {
        if (!focusLine) return false
        const focusColumnName = tableState.focusFieldName
        if (tableState.inputFocus) clean(focusLine, focusColumnName);
        const permittedColumns = columns.filter(columnCanReceiveFocus)
        const currentIndex = permittedColumns.findIndex(col => col.name === focusColumnName);
        if (currentIndex < 0) return false;
        let nextIndex = currentIndex + n;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= permittedColumns.length) nextIndex = permittedColumns.length - 1;
        if (nextIndex === currentIndex) {
            // non mi sono mosso
            return false;
        }
        const nextCol = permittedColumns[nextIndex];
        moveFocusTo(nextCol, focusLine);
        return true
    }

    // sposta il focus nella tabella.
    // avvia il salvataggio della riga che perde il focus, se serve.
    // questa funzione va usata tramite setTableState
    function stateMoveFocusTo(prev: TableState, line: Line|undefined, fieldName: string): TableState {
        // console.log(`moveFocusToSetter: from lineKey=${prev.focusLineKey} to lineKey=${line?.key} field=${fieldName}`)
        // metti il focus sulla nuova riga
        const focusLineKey = line?.key || ''

        if (focusLineKey === prev.focusLineKey && fieldName === prev.focusFieldName) {
            // console.log(`moveFocusToSetter: no change in focusLineKey`)
            return prev // SHORTCUT!
        }
        
        // nuovi valori:
        const lines: Line[] = prev.lines
        const focusFieldName = fieldName

        return {
            ...prev,
            lines,
            focusLineKey,
            focusFieldName,
        }
    }

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
    }

    // setta o rimuove un campo da un oggetto Data
    // (se value è undefined, rimuove il campo)
    // restituisce un nuovo oggetto Data in uscita
    function dataSetter(prev: Data, field: string, value:string|undefined) {
        if (value === undefined) {
            // remove field
            const {[field]:_, ...rest} = prev;
            return rest;
        } else {
            return {...prev, [field]: value}
        }
    }

    function clean(line: Line, fieldName: string) {
        const field = columns.find(c => c.name === fieldName)
        if (field instanceof Field) {
            let value = line.data[field.name]
            if (value === undefined) value = line.row?.data[field.name] || ''
            value = field.clean(value || '')
            setLineData(line, field.name, value)
        }
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
            // console.log(`saveLineIfNeeded: saving line ${line.key} with data`, data)
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
        // console.log(`saving row ${row._id} with data`, data)
        
        function updateLineState(update: Partial<Line>) {
            setTableState(prev => {
                // console.log(`updateLineState called in saveRow`)
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
        // console.log('saveRow result', res)

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

        const row = res.data?.addRow
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
} // fine Table component

const _ = gql`
  mutation addRow($sheetId: ObjectId!, $data: Data!) {
    addRow(sheetId: $sheetId, data: $data) {
      _id
      error
      anomalies
      data
      createdOn
      createdBy
      updatedOn
      updatedBy
    }
  }
`

const __ = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!) {
    patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
      _id
      __typename
      createdOn
      createdBy
      updatedOn
      updatedBy
      error
      anomalies
      data
    }
  }
`

const ___ = gql`
  mutation DeleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
  }
`

const _____ = gql`
  mutation DeleteRows($ids: [ObjectId!]!) {
    deleteRows(ids: $ids)
  }
`
