import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useMutation } from '@apollo/client'
import Schema from '@/app/lib/schema/Schema'

import { InputCell } from '@/app/components/Input'
import { Row, Data, Sheet } from '@/app/lib/models'
import { ADD_ROW, PATCH_ROW, DELETE_ROW, useAddRow, usePatchRow, useDeleteRow } from './TableInner'

export default function RowForm({sheet, schema, row, onCancel}: {
  sheet: Sheet,
  schema: Schema, 
  row?: WithId<Row>,
  onCancel: () => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow() 
  const [fields, setFields] = useState<Data>(Object.fromEntries(schema.fields.map(f => [f.name, row?.data[f.name] || ''])))
    
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified()

  if (loading) {
    return (
      <div className="row-form loading">
        <h3>{row ? 'Modifica Riga' : 'Nuova Riga'}</h3>
        <div>Caricamento...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="row-form error" onClick={dismissError}>
        <h3>Errore</h3>
        <div>Errore: {error.message}</div>
        <button onClick={dismissError}>Chiudi</button>
      </div>
    )
  }

  return (
    <div className={`row-form ${modified ? "modified" : ""}`}>
      <h3>{row ? 'Modifica Riga' : 'Nuova Riga'}</h3>
      
      <div className="form-fields">
        {schema.fields.map(field => (
          <div key={field.name} className="form-field">
            <label className="field-label">
              {field.header}:
            </label>
            <div className="field-input">
              {field.editable ? (
                <InputCell
                  field={field}
                  value={fields[field.name] || ''} 
                  setValue={v => setFields(fields => ({...fields, [field.name]: v}))}
                  onEnter={save}
                />
              ) : (
                <span className="readonly-field">{fields[field.name] || ''}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="form-actions">
        <button 
          disabled={loading || !modified} 
          onClick={save}
          className="save-button"
        >
          {row ? 'Salva Modifiche' : 'Aggiungi Riga'}
        </button>
        
        {row?._id && (
          <button 
            disabled={loading} 
            onClick={deleteFunction}
            className="delete-button"
          >
            Elimina
          </button>
        )}
        
        <button 
          disabled={loading} 
          onClick={onCancel}
          className="cancel-button"
        >
          Annulla
        </button>
      </div>
    </div>
  )

  function hasBeenModified() {
    for (const field of schema.fields) {
      if (!row && fields[field.name] !== '') return true;
      if (row && fields[field.name] !== row.data[field.name]) return true;
    }
    return false;
  }

  function dismissError() {
    if (addError) return addReset()
    if (patchError) return patchReset()
    if (deleteError) return deleteReset()
  }

  async function save() {
    try {
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
          sheetId: sheet._id,
          data: fields,
        }})
        // Reset form for new entries
        setFields(Object.fromEntries(schema.fields.map(f => [f.name, ''])))
      }
      onCancel() // Close form after successful save
    } catch (error) {
      // Error will be handled by the mutation hook
      console.error('Save error:', error)
    }
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
    try {
      await deleteRow({variables: { _id: row._id }})
      onCancel() // Close form after successful delete
    } catch (error) {
      console.error('Delete error:', error)
    }
  }
}
