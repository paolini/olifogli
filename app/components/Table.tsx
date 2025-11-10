"use client"

import { Row, Sheet, useAddRowMutation, useDeleteRowMutation, usePatchRowMutation } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import useProfile from '../lib/useProfile'
import TableActions, { TableActionsErrors, useTableActionsContext } from './TableActions'
import Checkboxes, { useCheckboxesState } from './TableCheckboxes'
import TableBody, { EMPTY_TABLE_STATE, Line, newLine, TableState } from './TableBody'
import TableHeader from './TableHeader'
import { KeyboardEvent, useState } from 'react'
import { myTimestamp } from '../lib/util'
import { Data } from '../lib/models'

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

export default function Table({edit, rows, sheet, refresh, refreshLoading}: {
  edit: boolean,
  rows: Row[],
  sheet: Sheet,
  refresh?: () => Promise<void>,
  refreshLoading?: boolean
}) {
    const schema = schemas[sheet.schema]
    const profile = useProfile();
    const userHasSheetAdminPrivileges = profile?.isAdmin || sheet.ownerId.toString() === profile?._id?.toString() || sheet.permissions.some(p => p.role === 'admin' && (p.userId?.toString() === profile?._id?.toString() || p.email === profile?.email))
    const [checkboxesState, setCheckboxesState] = useCheckboxesState();
    const [ tableState, setTableState ] = useState<TableState>(EMPTY_TABLE_STATE)
    const [sortCriterium, setSortCriterium] = useState<SortCriterium>({field: '', direction: 1});
    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRowMutation() // useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRowMutation() // usePatchRow()
    const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRowMutation() // useDeleteRow()

    const loading = addLoading || patchLoading || deleteLoading
    const error = addError || patchError || deleteError
    const dismissErrors = () => { addReset(); patchReset(); deleteReset(); }

    if (!schema) {
        return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
    }

    const columns: Column[] = [
        ...(checkboxesState.showAdditionalColumns ? ADDITIONAL_COLUMNS : []),
        ...schema.fields.filter(f => checkboxesState.showHiddenColumns || !f.hidden)
    ]

    const focusLine = tableState.lines.find(l => l.key === tableState.focusLineKey)

    return <div className="table-container">
        <div className="table-header">
            <TableActions sheet={sheet} schema={schema} checkboxesState={checkboxesState} setCheckboxesState={setCheckboxesState} userHasSheetAdminPrivileges={userHasSheetAdminPrivileges} tableState={tableState} setTableState={setTableState}/>
        </div>
        <div className="table-scroll-container" tabIndex={0} onKeyDown={onKeyDown}>
            currentRow={tableState.focusLineKey} currentField={tableState.focusFieldName}
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
                    sheet={sheet}
                    schema={schema}
                    rows={rows}
                    columns={columns}
                    tableState={tableState}
                    setTableState={setTableState}
                    showStandardAnswers={checkboxesState.showStandardAnswers}
                    refresh={refresh}
                    refreshLoading={refreshLoading}
                    error={error}
                    dismissErrors={dismissErrors}
                    onCellClick={onCellClick}
                    addNewRow={addNewRow}
                    loading={loading}
                    setLineData={setLineData}
                />
            </table>
        </div>
    </div>
    
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
                const lines = [...prev.lines]
                tableOrdina(sort_criteria, lines)
                if (!lines.some((line, i) => line !== prev.lines[i])) {
                    return prev // shortcut: don't modify the array
                }
                return {...prev,lines}
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

    function moveLeft() {
        if (!focusLine) return
        const focusColumnName = tableState.focusFieldName
        const currentIndex = columns.findIndex(col => col.name === focusColumnName);
        if (currentIndex < 1) return false;
        const prevCol = columns[currentIndex - 1];
        onCellClick(prevCol, focusLine);
        return true
    }

    function moveRight() {
        if (!focusLine) return
        const focusColumnName = tableState.focusFieldName
        const currentIndex = columns.findIndex(col => col.name === focusColumnName);
        if (currentIndex < 0 || currentIndex >= columns.length - 1) return false;
        const nextCol = columns[currentIndex + 1];
        onCellClick(nextCol, focusLine);
        return true;
    }

    function onKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
        console.log(`Table onKeyDown for key: ${e.key}`);
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
        if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        // sposto il focus a sinistra
        moveLeft();
        }
        if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        // sposto il focus a destra
        moveRight();
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