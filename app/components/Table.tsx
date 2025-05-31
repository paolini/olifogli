"use client"
import { useState, memo, useImperativeHandle, Ref } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, StoreObject, gql } from '@apollo/client';
import { Schema, schemas, AvailableSchemas, Field } from '@/app/lib/schema'
import Papa from "papaparse"

import { InputCell } from '@/app/components/Input'
import { Row, Data } from '@/app/lib/models'
import { Ordering, useCriteria, filtraEOrdina } from '@/app/components/Ordering'
import ErrorElement from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import { myTimestamp } from '../lib/util';

export interface RowWithId extends Row {
    __typename: string;
}

const GET_ROWS = gql`
  query getRows($sheetId: ObjectId!) {
    rows(sheetId: $sheetId) {
      _id
      isValid
      data
      updatedOn
    }
  }
`;

export const ADD_ROW = gql`
  mutation addRow($sheetId: ObjectId!, $data: JSON!) {
    addRow(sheetId: $sheetId, data: $data) {
      _id
      isValid
      data
    }
  }
`;

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: JSON!) {
    patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
      _id
      __typename
      updatedOn
      isValid
      data
    }
  }
`;

const DELETE_ROW = gql`
  mutation deleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
  }
`;

export default function Table({ref, sheetId, schemaName}:{
    ref: Ref<{csv_download: () => void}>,
    sheetId: string, 
    schemaName: AvailableSchemas,
  }) {
  const schema = schemas[schemaName]
  const { loading, error, data } = useQuery<{rows:WithId<Row>[]}>(GET_ROWS, {variables: {sheetId}});
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const criteria = useCriteria(schema)
  useImperativeHandle(ref, () => ({csv_download}))
  
  if (error) return <ErrorElement error={error}/>
  if (loading || !data) return <Loading />
  if (!data) return [] // cannot really happen
  const rows = filtraEOrdina(criteria, data.rows)

  return <>
    <span>{data.rows.length} righe</span>
    {rows.length < data.rows.length && <span> ({rows.length} visualizzate)</span>}
    <br />
    <Ordering criteria={criteria}/>
    <table>
      <thead>
        <tr>
            {schema.fields.map(field => 
              <th scope="col" key={field.name} className={field.css_style}>
              {field.header}
              </th>)}
        </tr>
      </thead>
      <tbody>
        { rows.map((row) => <MyRow key={row._id.toString()} current={row._id === currentRowId} sheetId={sheetId} schema={schema} row={row} setCurrentRowId={setCurrentRowId} />)} 
        { currentRowId 
          ? <tr><td><button onClick={() => setCurrentRowId(null)}>nuova riga</button></td></tr>
          : <InputRow sheetId={sheetId} schema={schema}/>}
      </tbody>
    </table>
  </>

  async function csv_download() {
      const data = rows.map(row => {
          const obj: Record<string, string> = {}
          for (const key in schema.fields) {
              obj[key] = row.data[key] || ''
          }
          return obj
      })
      const filename = myTimestamp(new Date()).replace(':', '-').replace(' ', '_') + '.csv'

      downloadCSVWithPapa(
          schema.csv_header(),
          rows.map(row => schema.csv_row(row.data)),
          filename
      )
  }
}

const MyRow = memo(MyRowInternal)

function MyRowInternal({current, sheetId, schema, row, setCurrentRowId}: {
  current: boolean,
  sheetId: string,
  schema: Schema,
  row: WithId<Row>,
  setCurrentRowId: (id: ObjectId|null) => void
}) {
  if (current) return <InputRow sheetId={sheetId} schema={schema} row={row} done={() => setCurrentRowId(null)}/>
  else return <TableRow schema={schema} row={row} onClick={() => setCurrentRowId(row._id)} />
}

function TableRow({schema, row, onClick}: {
    schema: Schema,
    row: WithId<Row>, 
    onClick?: () => void,
}) {
  const className = `clickable${row.isValid ? "" : " alert"}`

  return <tr className={className} onClick={() => onClick && onClick()}>
    { schema.fields.map(field => <TableCell key={field.name} field={field} value={row.data[field.name]}/>) }
  </tr>
}

function TableCell({field, value}:{
  field: Field,
  value: string,
}) {
  return <td key={field.name} className={field.css_style}>{value}</td>
}

function InputRow({sheetId, schema, row, done}: {
  sheetId: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow() 
  const [fields, setFields] = useState<Data>(Object.fromEntries(schema.fields.map(f => [f.name, row?.data[f.name] || ''])))
    
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified()

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={99}>Errore: {error.message}</td></tr>

  return <tr className={modified ? "alert": ""}>
    { schema.fields.map(field => 
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
    <td>
      <button disabled={loading} onClick={save}>salva</button>
      { row?._id && <button disabled={loading} onClick={deleteFunction}>elimina</button>}
    </td>
  </tr>

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
      setFields(fields => ({
        ...fields,
        cognome: '',
        nome: '',
        dataNascita: '',
      }))
    }
    if (done) done()
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
    await deleteRow({variables: { _id: row._id }})
  }
}

function useAddRow() {
  return useMutation<{ addRow: RowWithId }>(ADD_ROW, {
    update(cache, { data }) {
      if (!data) return;          
      const newRow = data.addRow; // Assumendo che la mutazione restituisca la nuova riga          
      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            // Controlla se la riga è già presente per evitare duplicati
            if (existingRows.some((row:StoreObject) => readField("_id", row) === newRow._id)) {
              return existingRows;
            }
            return [...existingRows, newRow];
          },
        },
      });
    }
  });
}

function usePatchRow() {
  return useMutation<{ patchRow: StoreObject }>(PATCH_ROW, {
    update(cache, { data }) {
      const updatedRow = data?.patchRow;
      if (!updatedRow) return;

      cache.modify({
        id: cache.identify(updatedRow),
        fields: Object.fromEntries(
          Object.entries(updatedRow).map(([key, value]) => [key, () => value])
        ),
      });
    }});
}

function useDeleteRow() {
  return useMutation<{ deleteRow: string }>(DELETE_ROW, {
    update(cache, { data }) {
      const deletedId = data?.deleteRow;
      if (!deletedId) return;

      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            return existingRows.filter((row:StoreObject) => readField("_id", row) !== deletedId);
          },
        },
      });
    }});
}

function downloadCSVWithPapa(fields: string[], rows: string[][], filename = "dati.csv") {
  const csv = Papa.unparse({
      fields: fields,
      data: rows
  }); // converte array di oggetti o array di array

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
