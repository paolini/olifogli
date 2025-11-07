"use client"

import { Row, Sheet } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import useProfile from '../lib/useProfile'
import TableActions, { TableActionsErrors, useTableActionsContext } from './TableActions'
import Checkboxes, { useCheckboxesState } from './TableCheckboxes'
import TableBody, { useTableBodyContext } from './TableBody'
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
    const tableBodyContext = useTableBodyContext({schema, rows, showStandardAnswers: checkboxesState.showStandardAnswers});
    const [sortCriterium, setSortCriterium] = useState<SortCriterium>({field: '', direction: 1});

    const tableActionContext = useTableActionsContext({
        schema, 
        profile:profile || undefined, sheet, 
        userHasSheetAdminPrivileges,
        refresh, 
        checkboxesState, 
        sortedRows: tableBodyContext.sortedRows, 
        selectedIds: tableBodyContext.selectedIds, 
    })

    if (!schema) {
        return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
    }

    const columns: Column[] = [
        ...(checkboxesState.showAdditionalColumns ? ADDITIONAL_COLUMNS : []),
        ...schema.fields.filter(f => checkboxesState.showHiddenColumns || !f.hidden)
    ]

    return <div className="table-container">
        <div className="table-header">
            <TableActionsErrors ctx={tableActionContext} />
            <Checkboxes schema={schema} state={checkboxesState} setState={setCheckboxesState} />
            <TableActions ctx={tableActionContext}/>
        </div>

        <div className="table-scroll-container">
            <table className="my-table">
                <TableHeader 
                    schema={schema}
                    columns={columns} 
                    doSortRows={doSortRows} sortCriterium={sortCriterium} setSortCriterium={setSortCriterium}
                    allSelected={tableBodyContext.selectedIds.size === tableBodyContext.sortedRows.length}
                    selectAll={() => {tableBodyContext.setSelectedIds(new Set(tableBodyContext.sortedRows.map(row => row._id.toString())))}}
                    selectNone={() => {tableBodyContext.setSelectedIds(new Set())}}
                    />
                <TableBody 
                    ctx={tableBodyContext} 
                    edit={edit}
                    columns={columns}
                />
            </table>
        </div>
    </div>
    
    function doSortRows(field: Field|string, direction: number) {
        if (field instanceof Field) {
            const sort_criteria = [{ campo: field, direzione: direction }]
            tableBodyContext.setSortedRows(oldSortedRows => tableOrdina(sort_criteria, oldSortedRows))
        } else {
            tableBodyContext.setSortedRows(oldSortedRows => [...oldSortedRows].sort((a,b) => {
                const aValue = a[field as keyof Row];
                const bValue = b[field as keyof Row];
                if (aValue < bValue) return -direction;
                if (aValue > bValue) return direction;
                return 0;
            }))
        }
    }
}