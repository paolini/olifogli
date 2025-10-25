import { useState, memo } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useMutation, StoreObject, gql } from '@apollo/client'
import Schema from '@/app/lib/schema/Schema'
import { ChoiceAnswerField, Field } from '@/app/lib/schema/fields'

import { InputCell } from '@/app/components/Input'
import { Data } from '@/app/lib/models'
import { Row, Sheet } from '@/app/graphql/generated'
import { myTimestamp } from '../lib/util'
import Table from './Table'

export default function TableInner({rows, currentRowId, setCurrentRowId, sheet, schema, showStandardAnswers, showAdditionalColumns}: {
  rows: Row[],
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  return <table className="my-table">
    <colgroup>
      { showAdditionalColumns && <>
        <col className="createdOn" />
        <col className="createdBy" />
        <col className="updatedOn" /> 
        <col className="updatedBy" />
      </>}
      {schema.fields.map(field => <col key={field.name} className={field.css_style} />)}
    </colgroup>
    <thead>
      <tr>
        { showAdditionalColumns && <>
          <th scope="col" className="createdOn">istante creazione</th>
          <th scope="col" className="createdBy">creato da</th>
          <th scope="col" className="updatedOn">istante modifica</th>
          <th scope="col" className="updatedBy">aggiornato da</th>
        </>}
        {schema.fields.map(field => 
          <th scope="col" key={field.name} className={field.css_style}>
            {field.header}
          </th>)}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => 
        <MyRow key={row._id.toString()} current={row._id === currentRowId} sheetId={sheet._id.toString()} schema={schema} row={row} setCurrentRowId={setCurrentRowId} showStandardAnswers={showStandardAnswers} showAdditionalColumns={showAdditionalColumns} />)} 
      {currentRowId 
        ? <tr><td colSpan={schema.fields.length}><button className="bg-alert" onClick={() => setCurrentRowId(null)}>
          aggiungi riga
          </button></td></tr>
        : <InputRow sheetId={sheet._id.toString()} schema={schema} showAdditionalColumns={showAdditionalColumns} />}
    </tbody>
  </table>
}
  
const MyRow = memo(MyRowInternal)

function MyRowInternal({current, sheetId, schema, row, setCurrentRowId, showStandardAnswers, showAdditionalColumns}: {
  current: boolean,
  sheetId: string,
  schema: Schema,
  row: WithId<Row>,
  setCurrentRowId: (id: ObjectId|null) => void,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  if (current) return <InputRow sheetId={sheetId} schema={schema} row={row} done={() => setCurrentRowId(null)} showAdditionalColumns={showAdditionalColumns} />
  else return <TableRow schema={schema} row={row} onClick={() => setCurrentRowId(row._id)} showStandardAnswers={showStandardAnswers} showAdditionalColumns={showAdditionalColumns} />
}

function TableRow({schema, row, onClick, showStandardAnswers, showAdditionalColumns}: {
  schema: Schema,
  row: WithId<Row>,
  onClick?: () => void,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  const className = `clickable${row.error ? " alert" : ""}`
  return <tr className={className} onClick={() => onClick && onClick()}>
    { showAdditionalColumns && <TableInfoCells row={row} />}
    {schema.fields.map(field => <TableCell key={field.name} field={field} value={row.data[field.name]} showStandardAnswers={showStandardAnswers} />)}
    {row.error && <td className="error">{row.error}</td>}
  </tr>
}

function TableInfoCells({row}: {
  row: WithId<Row>|undefined
}) {
  return <>
    <td className="createdOn">{row?.createdOn && myTimestamp(row.createdOn)}</td>
    <td className="createdBy">{row?.createdBy || ''}</td> 
    <td className="updatedOn">{row?.updatedOn && myTimestamp(row?.updatedOn)}</td>
    <td className="updatedBy">{row?.updatedBy || ''}</td>
  </>
}

function TableCell({field, value, showStandardAnswers}:{
  field: Field,
  value: string,
  showStandardAnswers?: boolean
}) {
  let extra_css="";
  let correct_value = undefined;
  let title = value;
  if (field instanceof ChoiceAnswerField) {
    if (value.length === 7) {
      // showStandardAnswers decides whether to show 
      // the corresponding answers in the standard permutation (211/311)
      correct_value = showStandardAnswers ? value.charAt(5) : value.charAt(3)
      value = showStandardAnswers ? value.charAt(4) : value.charAt(0);
      extra_css = value === correct_value
        ? "correct"
        : value === '-' 
          ? "empty" 
            : ["A", "B", "C", "D", "E"].includes(value) 
              ? "incorrect" 
              : "invalid";
      title = value === correct_value ? value : `${value} (invece di ${correct_value})`;
    }
  }
  return <td key={field.name} title={title} className={`${field.css_style} ${extra_css}`}>
      {value}
  </td>
}

function InputRow({sheetId, schema, row, done, showAdditionalColumns}: {
  sheetId: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void,
  showAdditionalColumns: boolean
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow() 
  const columns = schema.fields
  const [fields, setFields] = useState<Data>(Object.fromEntries(columns.map(f => [f.name, row?.data[f.name] || ''])))
  
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified()

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={columns.length}>Errore: {error.message}</td><td></td></tr>

  return <tr className={modified ? "alert": ""}>
    {showAdditionalColumns && <TableInfoCells row={row} />}
    {columns.map(field => 
      field.editable
        ? <td key={field.name} className={field.css_style}>
          <InputCell
            field={field}
            value={fields[field.name]||''} 
            setValue={v => setFields(fields => ({...fields, [field.name]: v}))}
            onEnter={save}
          />
        </td>
        : <TableCell key={field.name} field={field} value={fields[field.name]||''} />
    )}
    <td className="actions-cell">
      <button className="bg-green-60" disabled={loading} onClick={save}>
        salva
      </button>
      {row?._id && <button className="ml-1 bg-error" disabled={loading} onClick={deleteFunction}>
        elimina
      </button>}
    </td>
  </tr>

  function hasBeenModified() {
    for (const field of columns) {
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
    if (done) done()
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
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
