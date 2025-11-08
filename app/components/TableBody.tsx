import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useEffect, useMemo, useState } from "react"
import { Row, Sheet } from "../graphql/generated"
import TableRow, { RowSelectionState } from "./TableRow"
import Schema from "../lib/schema/Schema"
import { Column } from "./Table"
import { Data } from "../lib/models"
import { ApolloError, gql, StoreObject, useMutation } from "@apollo/client"
import { Field } from "../lib/schema/fields"

export type TableBodyInput = {
    schema: Schema,
    sheet: Sheet,
    rows: Row[],
    showStandardAnswers: boolean,
}

export type RowEventuallyNew = Row | {
  _id: undefined,
  data: Data,
  updatedOn: Date,
  error: string,
} 

export type TableBodyContext = TableBodyInput & {
    sortedRows: RowEventuallyNew[],
    setSortedRows: (rows: RowEventuallyNew[] | ((prev: RowEventuallyNew[]) => RowEventuallyNew[])) => void,
    selectedIds: Set<string>,
    setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void,
    focusRow: RowEventuallyNew | null,
    setFocusRow: (row: RowEventuallyNew | null) => void,
    focusFieldName: string,
    setFocusFieldName: (fieldName: string) => void,
    lastClickedId: string|null,
    setLastClickedId: (id: string | null) => void,
    rowModifiedData: Data,
    setRowModifiedData: Dispatch<SetStateAction<Data>>,
    addRow: ReturnType<typeof useAddRow>[0],
    patchRow: ReturnType<typeof usePatchRow>[0],
    deleteRow: ReturnType<typeof useDeleteRow>[0],
    loading: boolean,
    error: ApolloError | undefined,
    dismissErrors: () => void,
}

export function useTableBodyContext(input: TableBodyInput): TableBodyContext {
    const [sortedRows, setSortedRows] = useState<RowEventuallyNew[]>(input.rows)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [focusRow, setFocusRow] = useState<RowEventuallyNew | null>(null)
    const [focusFieldName, setFocusFieldName] = useState<string>('')
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
        loading: addLoading || patchLoading || deleteLoading,
        error: addError || patchError || deleteError,
        dismissErrors: () => { addReset(); patchReset(); deleteReset(); },
    }
}

export default function TableBody({edit, ctx, columns}: {
    edit: boolean,
    ctx: TableBodyContext,
    columns: Column[]
}) {
    const setModifiedData = useCallback((field: string, value: string | undefined) => {
      // se value è undefined tolgo il campo dal record
      // altrimenti lo aggiungo/aggiorno
      ctx.setRowModifiedData(prev => {
        if (value === undefined) {
          const {[field]: _, ...data} = prev
          return data
        } else {
          return {...prev, [field]: value}
        }
      })
    }, [ctx.setRowModifiedData])
          
    useEffect(remap_incoming_rows_to_sorted, [ctx.rows])

    return <tbody onKeyDown={onKeyDown}>
      <tr><td colSpan={columns.length + 1}>{JSON.stringify(ctx.rowModifiedData)}</td></tr>
        {ctx.sortedRows.map((row) => {
            const focusColumnName = (ctx.focusRow === row) ? ctx.focusFieldName : ''
            if (focusColumnName && ctx.error) {
              return <tr className="error" onClick={() => ctx.dismissErrors()}><td colSpan={columns.length + 1}>Errore: {ctx.error.message}</td><td></td></tr>
            }
            return <TableRow
                edit={edit}
                schema={ctx.schema}
                key={(row._id || '__new__').toString()} 
                row={row} 
                columns={columns}
                focusColumnName={focusColumnName}
                selectionState={compute_selection_state_for_row((row._id || '__new__').toString())}
                showStandardAnswers={ctx.showStandardAnswers}
                onCellClick={(column: Column) => onCellClick(column,row)}
                modifiedData={ctx.rowModifiedData}
                setModifiedData={setModifiedData}
            />}
        )}
    </tbody>

    function onKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
      const focusRow = ctx.focusRow
      if (edit // stiamo modificando il foglio 
        && focusRow // c'è una riga in modifica
        && e.key === "Enter"
      ) {
          const rows = ctx.sortedRows
          e.preventDefault()
          e.stopPropagation()
          saveRowIfNeeded(focusRow)
          ctx.setRowModifiedData({}) 
          const row_index = rows.indexOf(focusRow)
          if (row_index<0) return // non dovrebbe succedere!
          const editable_columns = columns.filter(col => (col instanceof Field && !col.hidden && col.editable))
          if (row_index + 1 === rows.length) {
            // era l'ultima riga della tabella
            if (editable_columns.length >0) {
              const newRow = addNewRowSimilarTo(focusRow)
              ctx.setFocusRow(newRow)
              ctx.setFocusFieldName(editable_columns[0].name)
            } else {
              // non ci sono colonne da modificare
              ctx.setFocusRow(null)
              ctx.setFocusFieldName('')
            }
          } else {
            const newFocusRow = rows[row_index + 1]
            const keys = editable_columns.map(col => col.name)
            const values = keys.map(key => newFocusRow.data[key])
            let i = keys.indexOf(ctx.focusFieldName)
            if (i<=0) i=0;
            while(i>0 && (values[i] || '') === '' && (values[i-1] || '') === '') i--; // mi sposto a sinistra finché ci sono campi vuoti
            if (keys[i]) {
              ctx.setFocusRow(newFocusRow)
              ctx.setFocusFieldName(keys[i])
            } else {
              ctx.setFocusRow(null)
              ctx.setFocusFieldName('')
            }
          }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // esco dalla modalità modifica
        if (Object.keys(ctx.rowModifiedData).length > 0 && !confirm("Ci sono modifiche non salvate su questa riga. Vuoi scartarle?")) {
            return
        }
        ctx.setFocusRow(null)
        ctx.setFocusFieldName('')
        ctx.setRowModifiedData({})
      }
    }

    function addNewRowSimilarTo(row?: RowEventuallyNew): RowEventuallyNew {
      const data: Data = Object.fromEntries(ctx.schema.fields.map(field => [field.name,'']))
      const newRow: RowEventuallyNew = {_id: undefined, data, updatedOn: new Date(), error:''}
      ctx.setSortedRows([...ctx.sortedRows, newRow])
      return newRow
    }

    function compute_selection_state_for_row(rowId: string): RowSelectionState {
        function allIds(rowId: string, shift: boolean): string[] {
            if (!ctx.lastClickedId || !shift) return [rowId]
            const currentIndex = ctx.sortedRows.findIndex(r => (r._id || '__new__').toString() === rowId)
            if (currentIndex === -1) return [rowId] // non dovrebbe accadere!
            let anchorIndex = ctx.sortedRows.findIndex(r => (r._id || '__new__').toString() === ctx.lastClickedId)
            if (anchorIndex === -1) anchorIndex = currentIndex
            const [start, end] = [Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex)]
            return ctx.sortedRows.slice(start, end + 1).map(r => (r._id || '__new__').toString())
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
          const replacedRows: RowEventuallyNew[] = prevSortedRows.map(r => {
              if (r._id === undefined) return r // nuova riga, la mantengo così com'è
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

    async function onCellClick(column: Column, row: RowEventuallyNew) {
        const newRow = row
        const oldRow = ctx.focusRow
        if (newRow !== oldRow) {
            // abbiamo cambiato riga
            if (oldRow) {
                // c'è da salvare la riga vecchia
                saveRowIfNeeded(oldRow)
            }
            ctx.setRowModifiedData({})
            ctx.setFocusRow(newRow)
        } else {
            // stessa riga, cambia solo la colonna
        }
        ctx.setFocusFieldName(column.name)
    }

    async function saveRowIfNeeded(row: RowEventuallyNew) {
        const data = ctx.rowModifiedData
        const modifiedFields = Object.keys(data)
        if (modifiedFields.length !== 0) {
            if (row._id) {
                // update
                await ctx.patchRow({variables: {
                    _id: row._id,
                    updatedOn: row.updatedOn || new Date(),
                    data: data,
                }})
            } else {
                // add
                await ctx.addRow({variables: {
                    sheetId: ctx.sheet._id,
                    data: data,
                }})
            }
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
