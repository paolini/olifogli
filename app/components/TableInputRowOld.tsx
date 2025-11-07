import { useEffect, useRef, Dispatch, SetStateAction } from 'react'
import { WithId } from 'mongodb'
import { useMutation, StoreObject, gql } from '@apollo/client'
import Schema from '@/app/lib/schema/Schema'

import { InputCell } from '@/app/components/Input'
import { Row } from '@/app/graphql/generated'
import { RowInputState, stopEditRow, updateNewData, saveAndContinue, saveAndClose, cancelEditRow, handleRowChange } from './RowInputStateActions'

export default function TableInputRow({
  sheetId,
  schema,
  row,
  rowInputState,
  setRowInputState,
  showAdditionalColumns,
  showHiddenColumns,
  prevRow,
  nextRow,
  nextFieldName,
  isSelected,
  onToggleSelect
}: {
  sheetId: string,
  schema: Schema,
  row?: WithId<Row>,
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  prevRow?: Row | null,
  nextRow?: Row | null,
  nextFieldName?: string | null,
  isSelected?: boolean,
  onToggleSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow()
  const columns = schema.fields.filter(f => !f.hidden || showHiddenColumns);
  const firstInputRef = useRef<HTMLInputElement>(null)
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const editableColumns = columns.filter(f => f.editable)

  function handleEscape() {
    cancelEditRow(rowInputState, setRowInputState)
  }

  function handleArrowNavigation(currentFieldName: string, direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) {
    const currentIndex = editableColumns.findIndex(f => f.name === currentFieldName)
    
    if (direction === 'left' && cursorAtEdge && currentIndex > 0) {
      // Vai al campo precedente
      const prevField = editableColumns[currentIndex - 1]
      fieldRefs.current[prevField.name]?.focus()
      // Posiziona il cursore alla fine
      setTimeout(() => {
        const input = fieldRefs.current[prevField.name]
        if (input) {
          input.setSelectionRange(input.value.length, input.value.length)
        }
      }, 0)
    } else if (direction === 'right' && cursorAtEdge && currentIndex < editableColumns.length - 1) {
      // Vai al campo successivo
      const nextField = editableColumns[currentIndex + 1]
      fieldRefs.current[nextField.name]?.focus()
      // Posiziona il cursore all'inizio
      setTimeout(() => {
        const input = fieldRefs.current[nextField.name]
        if (input) {
          input.setSelectionRange(0, 0)
        }
      }, 0)
    } else if (direction === 'up') {
      // Cambia riga verso l'alto
      if (prevRow !== undefined) {
        handleRowChange(rowInputState, setRowInputState, prevRow, currentFieldName)
      }
    } else if (direction === 'down') {
      // Cambia riga verso il basso
      if (nextRow !== undefined) {
        handleRowChange(rowInputState, setRowInputState, nextRow, currentFieldName)
      }
    }
  }

  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified()

  // Mette il focus sul primo input quando viene creata una nuova riga
  useEffect(() => {
    if (!row && !loading && firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [row, loading])

  // Mette il focus sul campo cliccato quando si modifica una riga esistente
  useEffect(() => {
    if (row && rowInputState.focusFieldName && fieldRefs.current[rowInputState.focusFieldName]) {
      fieldRefs.current[rowInputState.focusFieldName]?.focus()
    }
  }, [row, rowInputState.focusFieldName])

  // Controlla se la riga è stata modificata da un altro utente
  useEffect(() => {
    if (rowInputState.updatedOn && row && row.updatedOn) {
      const rowTime = new Date(row.updatedOn).getTime()
      const stateTime = rowInputState.updatedOn.getTime()
      if (rowTime !== stateTime) {
        if (loading) return // evita di mostrare l'alert se stiamo salvando noi stessi
        alert("la riga che stai modificando è stata aggiornata da un altro utente. Per non creare conflitti devo annullare le tue modifiche.")
        stopEditRow(setRowInputState)
      }
    }
  }, [rowInputState.updatedOn, row, setRowInputState, loading])

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={columns.length + 1}>Errore: {error.message}</td><td></td></tr>

  return <tr className={modified ? "modified": ""}>
    <td className="checkbox-cell">
      {row && (
        <input 
          type="checkbox" 
          checked={isSelected || false}
          onChange={onToggleSelect}
        />
      )}
    </td>
    {showAdditionalColumns && <TableInfoCells row={row} />}
    {columns.map((field, index) => {
      const isFirstEditable = field.editable && columns.slice(0, index).every(f => !f.editable)
      return field.editable
        ? <td key={field.name} className={field.css_class + (fieldHasBeenModified(field.name) ? " modified" : "")}>
          <InputCell
            field={field}
            value={rowInputState.newData ? rowInputState.newData[field.name] || '' : ''}
            setValue={v => updateNewData(setRowInputState, { ...(rowInputState.newData || {}), [field.name]: v })}
            onEnter={() => save(true)}
            onEscape={handleEscape}
            onArrowNavigation={(direction, cursorAtEdge) => handleArrowNavigation(field.name, direction, cursorAtEdge)}
            inputRef={(el) => {
              if (isFirstEditable) {
                firstInputRef.current = el
              }
              fieldRefs.current[field.name] = el
            }}
          />
        </td>
        : <TableCell key={field.name} field={field} value={rowInputState.newData ? rowInputState.newData[field.name] || '' : ''} />
    })}
    <td className="actions-cell">
      <button className="bg-green-60" disabled={loading} onClick={() => save(false)}>
        salva
      </button>
      {row?._id && <button className="ml-1 bg-error" disabled={loading} onClick={deleteFunction}>
        elimina
      </button>}
    </td>
  </tr>

  function fieldHasBeenModified(fieldName: string) {
    if (!row && rowInputState.newData && rowInputState.newData[fieldName] !== '') return true;
    if (row && rowInputState.newData && rowInputState.newData[fieldName] !== row.data[fieldName]) return true;
    return false;
  }

  function hasBeenModified() {
    return columns.some(field => fieldHasBeenModified(field.name));
  }

  function dismissError() {
    if (addError) return addReset()
    if (patchError) return patchReset()
    if (deleteError) return deleteReset()
  }

  async function save(continue_editing?: boolean) {
    if (row?._id) {
      // patch - modifica di una riga esistente
      const result = await patchRow({variables: {
        _id: row._id,
        data: rowInputState.newData,
        updatedOn: row.updatedOn || new Date(),
      }})
      const updatedOnValue = result.data?.patchRow?.updatedOn
      const newUpdatedOn = updatedOnValue ? new Date(updatedOnValue as string) : null
      // Se c'è una riga successiva, passa ad essa, altrimenti chiudi
      if (continue_editing && nextRow !== undefined) {
        saveAndContinue(setRowInputState, nextRow, nextFieldName, newUpdatedOn)
      } else {
        saveAndClose(setRowInputState)
      }
    } else {
      // insert - aggiunta di una nuova riga
      await addRow({variables: {
        sheetId,
        data: rowInputState.newData,
      }})
      // Dopo aver salvato una nuova riga, prepara i campi per un'altra nuova riga
      if (rowInputState.newData) {
        updateNewData(setRowInputState, Object.fromEntries(
          Object.entries(rowInputState.newData)
            .map(([key, value]) => schema.fields_to_be_copied_on_new_row.includes(key)
              ? [key, value]
              : [key, '']
            )
        ))
      }
      // Mantieni il focus sul primo campo per continuare ad inserire
      if (firstInputRef.current) {
        setTimeout(() => firstInputRef.current?.focus(), 0)
      }
    }
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
    if (!confirm("Sei sicuro di voler eliminare questa riga?")) return
    await deleteRow({variables: { _id: row._id }})
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
