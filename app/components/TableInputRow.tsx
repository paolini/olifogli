import { useState, useEffect, useRef } from 'react'
import { WithId } from 'mongodb'
import { useMutation, StoreObject, gql } from '@apollo/client'
import Schema from '@/app/lib/schema/Schema'

import { InputCell } from '@/app/components/Input'
import { Data } from '@/app/lib/models'
import { Row } from '@/app/graphql/generated'
import { TableInfoCells, TableCell } from './TableRow'

export default function TableInputRow({sheetId, schema, row, done, showAdditionalColumns, showHiddenColumns, focusFieldName, onMoveToNext, isSelected, onToggleSelect}: {
  sheetId: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  focusFieldName?: string|null,
  onMoveToNext?: () => void,
  isSelected?: boolean,
  onToggleSelect?: () => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow() 
  const columns = schema.fields.filter(f => !f.hidden || showHiddenColumns);
  const [fields, setFields] = useState<Data>(Object.fromEntries(columns.map(f => [f.name, row?.data[f.name] || ''])))
  const [cacheUpdatedOn] = useState(row?.updatedOn) // controllo se la riga mi cambia sotto i piedi
  const firstInputRef = useRef<HTMLInputElement>(null)
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  
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
    if (row && focusFieldName && fieldRefs.current[focusFieldName]) {
      fieldRefs.current[focusFieldName]?.focus()
    }
  }, [row, focusFieldName])

  // Controlla se la riga è stata modificata da un altro utente
  useEffect(() => {
    if (cacheUpdatedOn && row && row.updatedOn !== cacheUpdatedOn) {
      if (loading) return // evita di mostrare l'alert se stiamo salvando noi stessi
      alert("la riga che stai modificando è stata aggiornata da un altro utente. Per non creare conflitti devo annullare le tue modifiche.")
      if (done) done()
    }
  }, [cacheUpdatedOn, row, done, loading])

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
            value={fields[field.name]||''} 
            setValue={v => setFields(fields => ({...fields, [field.name]: v}))}
            onEnter={() => save(true)}
            inputRef={(el) => {
              if (isFirstEditable) {
                firstInputRef.current = el
              }
              fieldRefs.current[field.name] = el
            }}
          />
        </td>
        : <TableCell key={field.name} field={field} value={fields[field.name]||''} />
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
    if (!row && fields[fieldName] !== '') return true;
    if (row && fields[fieldName] !== row.data[fieldName]) return true;
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
      // patch
      await patchRow({variables: {
        _id: row._id,
        data: fields,
        updatedOn: row.updatedOn || new Date(),
      }})
    } else {
      // insert
      await addRow({variables: {
        sheetId,
        data: fields,
      }})
      setFields(fields => Object.fromEntries(
        Object.entries(fields)
        .map(([key, value]) => schema.fields_to_be_copied_on_new_row.includes(key)
            ? [key, value]
            : [key, '']
      )))
    }
    // Se c'è una riga successiva, passa ad essa, altrimenti chiama done
    if (continue_editing && onMoveToNext) {
      onMoveToNext()
    } else if (done) {
      done()
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
  mutation deleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
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
