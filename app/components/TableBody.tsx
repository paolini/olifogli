import { Dispatch, SetStateAction, useEffect, useState } from "react"
import { Row, Sheet } from "../graphql/generated"
import TableRow, { RowSelectionState } from "./TableRow"
import Schema from "../lib/schema/Schema"
import { Column } from "./Table"
import { Data } from "../lib/models"
import { gql, StoreObject, useMutation } from "@apollo/client"


export type TableBodyInput = {
    schema: Schema,
    sheet: Sheet,
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

export type TableBodyContext = TableBodyInput & {
    sortedRows: Row[],
    setSortedRows: (rows: Row[] | ((prev: Row[]) => Row[])) => void,
    selectedIds: Set<string>,
    setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void,
    focusRow: Row | null,
    setFocusRow: (row: Row | null) => void,
    focusFieldName: string|null,
    setFocusFieldName: (fieldName: string | null) => void,
    lastClickedId: string|null,
    setLastClickedId: (id: string | null) => void,
    rowModifiedData: Data,
    setRowModifiedData: Dispatch<SetStateAction<Data>>,
    addRow: ReturnType<typeof useAddRow>[0],
    patchRow: ReturnType<typeof usePatchRow>[0],
    deleteRow: ReturnType<typeof useDeleteRow>[0],
}

export function useTableBodyContext(input: TableBodyInput): TableBodyContext {
    const [sortedRows, setSortedRows] = useState<Row[]>(input.rows)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [focusRow, setFocusRow] = useState<Row | null>(null)
    const [focusFieldName, setFocusFieldName] = useState<string|null>(null)
    const [lastClickedId, setLastClickedId] = useState<string|null>(null)
    const [rowModifiedData, setRowModifiedData] = useState<Data>({})

    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
    const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow()

    return {
        ...input,
        sortedRows,
        setSortedRows,
        selectedIds,
        setSelectedIds,
        focusRow,
        setFocusRow,
        focusFieldName,
        setFocusFieldName,
        lastClickedId,
        setLastClickedId,
        rowModifiedData,
        setRowModifiedData,
        addRow, patchRow, deleteRow,
    }
}

export default function TableBody({edit, ctx, columns}: {
    edit: boolean,
    ctx: TableBodyContext,
    columns: Column[]
}) {

    useEffect(remap_incoming_rows_to_sorted, [ctx.rows])

    return <tbody>
        <tr><td colSpan={12}>{JSON.stringify(ctx.rowModifiedData)}</td></tr>
        {ctx.sortedRows.map((row) => {
            const focusColumnName = ctx.focusRow === row && ctx.focusFieldName || ''
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
                modifiedData={ctx.rowModifiedData}
                setModifiedData={(field:string, value:string) => ctx.setRowModifiedData(old => ({...old, [field]: value}))}
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

    async function onCellClick(column: Column, row: Row) {
        const newRow = row
        const oldRow = ctx.focusRow
        if (newRow !== oldRow) {
            // abbiamo cambiato riga
            if (oldRow) {
                // c'è da salvare la riga vecchia
                saveRowIfNeeded(oldRow)
            }
            ctx.setRowModifiedData(newRow.data)
            ctx.setFocusRow(newRow)
        } else {
            // stessa riga, cambia solo la colonna
        }
        ctx.setFocusFieldName(column.name)
    }

    async function saveRowIfNeeded(row: Row) {
        const modifiedData = ctx.rowModifiedData
        const modifiedFields = Object.keys(modifiedData)
            .filter(field => modifiedData[field] !== row[field as keyof Row])
        if (modifiedFields.length !== 0) {
            const updatedData: Data = Object.fromEntries(
                modifiedFields.map(field => [field, modifiedData[field]])
            )
            if (row._id) {
                // update
                await ctx.patchRow({variables: {
                    _id: row._id,
                    updatedOn: row.updatedOn || new Date(),
                    data: updatedData,
                }})
            } else {
                // add
                await ctx.addRow({variables: {
                    sheetId: ctx.sheet._id,
                    data: updatedData,
                }})
            }
            ctx.setRowModifiedData({})
        }

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
