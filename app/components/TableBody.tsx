import { useEffect, useState } from "react"
import { Row } from "../graphql/generated"
import TableRow, { RowSelectionState } from "./TableRow"
import Schema from "../lib/schema/Schema"
import { Column } from "./Table"


export type TableBodyInput = {
    schema: Schema,
    rows: Row[],
    showStandardAnswers: boolean,
}

/*
export type RowInputState = {
  rowIsBeingEdited: boolean,
  rowId: ObjectId|null,
  oldData: Data|null,
  newData: Data|null,
  focusFieldName: string|null,
  updatedOn: Date|null
}
  */

// mappa field name -> new value
// i campi non mappati non sono stati modificati
export type RowModifiedData = Record<string, string> 

export type TableBodyContext = TableBodyInput & {
    sortedRows: Row[],
    setSortedRows: (rows: Row[] | ((prev: Row[]) => Row[])) => void,
    selectedIds: Set<string>,
    setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void,
    focusRowId: string|null,
    setFocusRowId: (rowId: string | null) => void,
    focusFieldName: string|null,
    setFocusFieldName: (fieldName: string | null) => void,
    lastClickedId: string|null,
    setLastClickedId: (id: string | null) => void,
    rowModifiedData: RowModifiedData,
}

export function useTableBodyContext(input: TableBodyInput): TableBodyContext {
    const [sortedRows, setSortedRows] = useState<Row[]>(input.rows)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [focusRowId, setFocusRowId] = useState<string|null>(null)
    const [focusFieldName, setFocusFieldName] = useState<string|null>(null)
    const [lastClickedId, setLastClickedId] = useState<string|null>(null)

    return {
        ...input,
        sortedRows,
        setSortedRows,
        selectedIds,
        setSelectedIds,
        focusRowId,
        setFocusRowId,
        focusFieldName,
        setFocusFieldName,
        lastClickedId,
        setLastClickedId
    }
}

export default function TableBody({edit, ctx, columns}: {
    edit: boolean,
    ctx: TableBodyContext,
    columns: Column[]
}) {

    useEffect(remap_incoming_rows_to_sorted, [ctx.rows])

    return <tbody>
        {ctx.sortedRows.map((row) => {
            const focusColumnName = ctx.focusRowId === row._id.toString() && ctx.focusFieldName || ''
            return <TableRow
                edit={edit}
                schema={ctx.schema}
                key={row._id.toString()} 
                row={row} 
                columns={columns}
                focusColumnName={focusColumnName}
                selectionState={compute_selection_state_for_row(row._id.toString())}
                showStandardAnswers={ctx.showStandardAnswers}
                onCellClick={(column: Column) => onCellClick(column,row)}
                modifiedData={focusColumnName ? ctx.rowModifiedData : undefined}
            />}
        )}
    </tbody>

    function compute_selection_state_for_row(rowId: string): RowSelectionState {
        function allIds(rowId: string, shift: boolean): string[] {
            if (!ctx.lastClickedId || !shift) return [rowId]
            const currentIndex = ctx.sortedRows.findIndex(r => r._id.toString() === rowId)
            if (currentIndex === -1) return [rowId] // non dovrebbe accadere!
            let anchorIndex = ctx.sortedRows.findIndex(r => r._id.toString() === ctx.lastClickedId)
            if (anchorIndex === -1) anchorIndex = currentIndex
            const [start, end] = [Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex)]
            return ctx.sortedRows.slice(start, end + 1).map(r => r._id.toString())
        }
        function doSelect(shift: boolean) {
            const ids_set = new Set(allIds(rowId, shift))
            ctx.setSelectedIds(oldSet => oldSet.union(ids_set))
            ctx.setLastClickedId(rowId)
        }
        function doDeselect(shift: boolean) {
            const ids_set = new Set(allIds(rowId, shift))
            ctx.setSelectedIds(oldSet => oldSet.difference(ids_set))
            ctx.setLastClickedId(rowId)
        }
        return {
            isSelected: ctx.selectedIds.has(rowId),
            doSelect, doDeselect
        }
    }

    function remap_incoming_rows_to_sorted() {
        ctx.setSelectedIds(oldSelectedIds => oldSelectedIds.intersection(new Set(ctx.rows.map(r => r._id.toString()))))
        ctx.setSortedRows(prevSortedRows => {
        const map_id_to_incoming_row = Object.fromEntries(ctx.rows.map((row,i) => [row._id.toString(), {row,i}]))
        const replacedRows: Row[] = prevSortedRows.map(r => {
            const row = map_id_to_incoming_row[r._id.toString()]?.row
            if (row === undefined) return undefined
            delete map_id_to_incoming_row[r._id.toString()]
            return row
        }).filter(r => r!==undefined)

        return [
            ...replacedRows,
            ...Object.values(map_id_to_incoming_row).sort().map(obj => obj.row)
            ]
        })
    }   

    function onCellClick(column: Column, row: Row) {
        ctx.setFocusRowId(row._id.toString())
        ctx.setFocusFieldName(column.name)
    }
}