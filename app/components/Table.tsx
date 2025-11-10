"use client"

import { Row, Sheet } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import useProfile from '../lib/useProfile'
import TableActions, { TableActionsErrors, useTableActionsContext } from './TableActions'
import Checkboxes, { useCheckboxesState } from './TableCheckboxes'
import TableBody, { EMPTY_TABLE_STATE, TableState } from './TableBody'
import TableHeader from './TableHeader'
import { useState } from 'react'
import { myTimestamp } from '../lib/util'

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

    if (!schema) {
        return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
    }

    const columns: Column[] = [
        ...(checkboxesState.showAdditionalColumns ? ADDITIONAL_COLUMNS : []),
        ...schema.fields.filter(f => checkboxesState.showHiddenColumns || !f.hidden)
    ]

    return <div className="table-container">
        <div className="table-header">
            <TableActions sheet={sheet} schema={schema} checkboxesState={checkboxesState} setCheckboxesState={setCheckboxesState} userHasSheetAdminPrivileges={userHasSheetAdminPrivileges} tableState={tableState} />
        </div>
        <div className="table-scroll-container">
            focusLineKey: {tableState.focusLineKey}
            {} focusFieldName: {tableState.focusFieldName}
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
}