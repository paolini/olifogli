"use client"

import { logDiagnostic } from '../lib/logging'
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
import useCellEditor, { canEditCell } from './useCellEditor'
import { Dispatch, KeyboardEvent, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { myTimestamp } from '../lib/util'
import { Data } from '../lib/models'
import { gql, useMutation } from '@apollo/client'

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
}

export const EMPTY_TABLE_STATE: TableState = {
    lines: [],
    focusLineKey: '',
    focusFieldName: '',
    selectedLineKeys: new Set<string>(),
    lastClickedLineKey: '',
    lastCsvDownload: undefined,
}

const MOVE_CURSOR_MUTATION = gql`
  mutation MoveCursor($sheetId: ObjectId!, $lineKey: String, $fieldName: String, $tabId: String!) {
    moveCursor(sheetId: $sheetId, lineKey: $lineKey, fieldName: $fieldName, tabId: $tabId)
  }
`

export type OtherCursors = Record<string, { email: string, lineKey: string | null, fieldName: string | null }>

export default function Table({edit, standardAnswers, rows, sheet, lastCsvDownload, csvDownload, setCsvImport, adminEditMode, otherCursors, tabId}: {
    edit: boolean,
    standardAnswers: boolean,
    rows: Row[],
    sheet: Sheet,
    lastCsvDownload?: Date,
    csvDownload: (rows: Row[], standardAnswers: boolean) => void,
    setCsvImport: Dispatch<SetStateAction<boolean>>,
    adminEditMode: boolean,
    otherCursors?: OtherCursors,
    tabId?: string,
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
    const cellEditor = useCellEditor(commitCell, validateCell)

    const [moveCursorMutation] = useMutation(MOVE_CURSOR_MUTATION)
    const moveCursorRef = useRef(moveCursorMutation)
    moveCursorRef.current = moveCursorMutation
    const moveCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {setTableState(prev => ({...prev, lastCsvDownload}))}, [lastCsvDownload, setTableState])
    useEffect(() => {setLastUpdate(new Date())}, [rows, setLastUpdate])
    useEffect(effectFunction, [rows, setTableState]);

    // Invia la posizione del cursore al server (debounced)
    useEffect(() => {
        if (!tabId) return
        if (moveCursorTimerRef.current) clearTimeout(moveCursorTimerRef.current)
        moveCursorTimerRef.current = setTimeout(() => {
            moveCursorRef.current({ variables: { sheetId: sheet._id, lineKey: tableState.focusLineKey || null, fieldName: tableState.focusFieldName || null, tabId } })
                .catch((err: unknown) => logDiagnostic('app/components/Table.movecursor_error', err))
            moveCursorTimerRef.current = null
        }, 300)
        return () => { if (moveCursorTimerRef.current) clearTimeout(moveCursorTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableState.focusLineKey, tableState.focusFieldName])

    // Al dismount, pulisce il cursore
    useEffect(() => {
        return () => { if (tabId) moveCursorRef.current({ variables: { sheetId: sheet._id, lineKey: null, fieldName: null, tabId } }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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
        const editor = cellEditor.editor
        if (editor.mode !== 'editing') return
        const line = tableState.lines.find(line => line.key === editor.lineKey)
        if (!edit || !line || !columns.includes(editor.field) || !canEditCell(editor.field, line.row, adminEditMode, standardAnswers)) cellEditor.reset()
    }, [edit, tableState.lines, columns, cellEditor.editor, adminEditMode, standardAnswers])

    useEffect(() => {
        // avvia un timer per il salvataggio automatico della riga in modifica
        const intervalId = setInterval(() => {
            const result = cellEditor.commit({ preserveDraft: true })
            if (result.ok) saveLineIfNeeded(result.value ?? focusLine)
        }, 5000)
        return () => clearInterval(intervalId);
    }, [focusLine,lastAlive]);

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
                    editor={cellEditor.editor}
                    onEditorChange={cellEditor.change}
                    onEditorBlur={(lineKey, fieldName) => cellEditor.commit({ keepEditing: true, expected: { lineKey, fieldName } })}
                    showStandardAnswers={standardAnswers}
                    error={error}
                    dismissErrors={dismissErrors}
                    onCellClick={(column: Column, line: Line) => moveFocusTo(column, line)}
                    addNewRow={addNewRow}
                    loading={loading}
                    otherCursors={otherCursors ?? {}}
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
              if (incomingRow.updatedOn === l.row.updatedOn) {
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


        return {
          lines,
          focusLineKey,
          focusFieldName,
          selectedLineKeys,
          lastClickedLineKey,
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

    function startEditing(line: Line, field: Field, firstCharacter?: string) {
        if (!canEditCell(field, line.row, adminEditMode, standardAnswers)) return
        const value = field.display(line.data[field.name] ?? line.row?.data[field.name] ?? '', '', false).value
        if (firstCharacter === undefined) {
            cellEditor.begin(line.key, field, value)
        } else {
            const result = field.editKey(firstCharacter, '', 0, 0)
            if (result && 'rejected' in result) return
            cellEditor.begin(line.key, field, result?.value ?? firstCharacter, false)
            if (result?.advance) moveRightOrLeft(result.advance, true)
        }
    }

    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (!edit || e.nativeEvent.isComposing || e.key === 'Process' || e.key === 'Dead') return
        setLastAlive(new Date())
        const editing = cellEditor.editor.mode === 'editing'
        const input = e.target instanceof HTMLInputElement ? e.target : undefined
        const key = e.key
        if (editing && input) {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            const result = cellEditor.key(key, input.selectionStart ?? 0, input.selectionEnd ?? 0)
            if (result) {
                e.preventDefault()
                e.stopPropagation()
                if (!('rejected' in result) && result.advance) moveRightOrLeft(result.advance, true)
                return
            }
            if (focusField?.type !== 'choice-answer' && (
                (key === 'ArrowLeft' && (input.selectionStart !== 0 || input.selectionEnd !== 0)) ||
                (key === 'ArrowRight' && (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length)))) return
            if (key === 'Backspace') {
                if (input.selectionStart !== 0 || input.selectionEnd !== 0) return
                e.preventDefault()
                moveRightOrLeft(-1)
                return
            }
        }
        if (key === 'Enter' && editing) {
            e.preventDefault()
            saveLineAndProceedToNext()
        } else if ((key === 'Enter' || key === 'F2') && !editing && focusLine && focusField) {
            e.preventDefault()
            startEditing(focusLine, focusField)
        } else if ((key === 'Delete' || key === 'Backspace') && !editing && focusLine && focusField) {
            e.preventDefault()
            commitCell(focusLine.key, focusField, '')
        } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !editing && focusLine && focusField) {
            e.preventDefault()
            e.stopPropagation()
            startEditing(focusLine, focusField, key)
        } else if (key === 'Escape' && editing) {
            e.preventDefault()
            const result = cellEditor.commit()
            if (result.ok) saveLineIfNeeded(result.value)
        } else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(key) && focusLine) {
            e.preventDefault()
            const distance = key.startsWith('Page') ? (e.shiftKey ? 1000 : 10) : 1
            moveDownOrUp((key.endsWith('Down') ? 1 : -1) * distance)
        } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab') {
            const distance = key === 'Tab' ? (e.shiftKey ? -1 : 1) : (key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)
            if (moveRightOrLeft(distance)) e.preventDefault()
        } else if (key === 'Home' || key === 'End') {
            e.preventDefault()
            moveRightOrLeft(key === 'Home' ? -1000 : 1000)
        }
    }

    // All exits go through this transition. Row saving consumes the committed
    // snapshot, so it never depends on a later blur or a pending React render.
    function goTo(line: Line | undefined, fieldName: string, keepEditing = false) {
        const result = cellEditor.commit()
        if (!result.ok) return
        const committed = result.value ?? focusLine
        if (committed && committed.key !== line?.key) saveLineIfNeeded(committed)
        setTableState(prev => stateMoveFocusTo(prev, line, fieldName))
        const field = columns.find(column => column.name === fieldName)
        if (keepEditing && line && field instanceof Field) {
            startEditing(committed?.key === line.key ? committed : line, field)
        }
    }

    function moveFocusTo(column: Column, line: Line) {
        if (!edit) return
        const editing = cellEditor.editor.mode === 'editing'
        const sameCell = line.key === tableState.focusLineKey && column.name === tableState.focusFieldName
        if (sameCell) {
            if (!editing && column instanceof Field) startEditing(line, column)
        } else goTo(line, column.name, editing)
    }

    function columnCanReceiveFocus(column: Column): boolean {
        const showHiddenColumns = checkboxesState.showHiddenColumns
        if (column instanceof Field) {
            return column.editable && (showHiddenColumns || !column.hidden)
        } else return false
    }

    function addNewRow() {
        const editing = cellEditor.editor.mode === 'editing'
        const result = cellEditor.commit()
        if (!result.ok) return
        const committed = result.value ?? focusLine
        saveLineIfNeeded(committed)
        const line = newLine()
        for (const field of columns) {
            if (field instanceof Field && field.precompileValue) {
                const value = committed?.data[field.name] ?? committed?.row?.data[field.name]
                if (value) line.data[field.name] = value
            }
        }
        const first = columns.find(columnCanReceiveFocus)
        setTableState(prev => stateMoveFocusTo({ ...prev, lines: [...prev.lines, line] }, line, first?.name ?? ''))
        if (editing && first instanceof Field) startEditing(line, first)
    }

    function saveLineAndProceedToNext() {
        if (!focusLine) return
        const index = tableState.lines.indexOf(focusLine)
        const next = tableState.lines[index + 1]
        if (!next) return addNewRow()
        const fields = columns.filter(columnCanReceiveFocus)
        let column = fields.findIndex(field => field.name === tableState.focusFieldName)
        const value = (i: number) => next.data[fields[i].name] ?? next.row?.data[fields[i].name] ?? ''
        while (column > 0 && !value(column) && !value(column - 1)) column--
        goTo(next, fields[column]?.name ?? '', true)
    }

    function moveDownOrUp(distance: number) {
        if (!focusLine) return
        const index = tableState.lines.indexOf(focusLine)
        const next = tableState.lines[Math.max(0, Math.min(tableState.lines.length - 1, index + distance))]
        if (next !== focusLine) goTo(next, tableState.focusFieldName)
    }

    function moveRightOrLeft(distance: number, keepEditing = cellEditor.editor.mode === 'editing') {
        if (!focusLine) return false
        const fields = columns.filter(columnCanReceiveFocus)
        const index = fields.findIndex(field => field.name === tableState.focusFieldName)
        if (index < 0) return false
        const next = Math.max(0, Math.min(fields.length - 1, index + distance))
        if (next === index) {
            const result = cellEditor.commit({ keepEditing: true })
            return !result.ok
        }
        goTo(focusLine, fields[next].name, keepEditing)
        return true
    }

    function stateMoveFocusTo(prev: TableState, line: Line | undefined, fieldName: string): TableState {
        if (prev.focusLineKey === (line?.key ?? '') && prev.focusFieldName === fieldName) return prev
        return { ...prev, focusLineKey: line?.key ?? '', focusFieldName: fieldName }
    }

    function validateCell(lineKey: string, field: Field, value: string): string {
        const line = tableState.lines.find(line => line.key === lineKey)
        const data = { ...line?.row?.data, ...line?.data, [field.name]: value }
        const context = schema.displayValidationContext(sheet.workbook.commonData ?? {})
        return field.editingError(value, { absent: context.absent(data), context })
    }

    function commitCell(lineKey: string, field: Field, value: string): Line | undefined {
        const line = tableState.lines.find(line => line.key === lineKey)
        if (!line || !canEditCell(field, line.row, adminEditMode, standardAnswers)) return
        const original = line.row?.data[field.name] ?? ''
        const { [field.name]: removed, ...data } = line.data
        if (line.saving || field.display(value, original, false).changed) data[field.name] = value
        if (Object.keys(data).length === Object.keys(line.data).length &&
            Object.keys(data).every(key => data[key] === line.data[key])) return line
        const updated = { ...line, data }
        setTableState(prev => ({ ...prev, lines: prev.lines.map(current => current.key === lineKey ? updated : current) }))
        return updated
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
                saveRow(row, data, key) // async progress
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

    function acknowledgeSave(key: string, row: Row, submitted: Data) {
        setTableState(prev => ({ ...prev, lines: prev.lines.map(line => {
            if (line.key !== key) return line
            const remaining = { ...line.data }
            for (const [field, value] of Object.entries(submitted)) {
                if (remaining[field] === value) delete remaining[field]
            }
            return { ...line, row, data: remaining, saving: false, error: '' }
        }) }))
    }

    async function saveRow(row: Row, data: Data, key: string) {
        // console.log(`saving row ${row._id} with data`, data)

        function updateLineState(update: Partial<Line>) {
            setTableState(prev => {
                // console.log(`updateLineState called in saveRow`)
                const lines: Line[] = prev.lines.map(line => line.key === key
                    ? {...line, ...update}
                    : line)
                return {...prev, lines }
            })
        }

        const res = await patchRow({variables: {
            _id: row._id,
            updatedOn: row.updatedOn || new Date(),
            data,
            tabId: tabId,
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
        // A response acknowledges only the submitted values, never later edits.
        acknowledgeSave(key, r, data)
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
            tabId: tabId,
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
        acknowledgeSave(lineKey, row, data)
    }
} // fine Table component

const _ = gql`
  mutation addRow($sheetId: ObjectId!, $data: Data!, $tabId: String) {
    addRow(sheetId: $sheetId, data: $data, tabId: $tabId) {
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
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!, $tabId: String) {
    patchRow(_id: $_id, updatedOn: $updatedOn, data: $data, tabId: $tabId) {
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
