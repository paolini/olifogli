"use client"
import { useState, memo, useImperativeHandle, Ref } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, StoreObject, gql } from '@apollo/client';
import { Schema, schemas, AvailableSchemas } from '@/app/lib/schema'
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
            {Object.entries(schema.fields).map(([field,type]) => 
              <th scope="col" key={field} className={`schema-${field} type-${type}`}>
              {columnTitle(field)}
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

  function columnTitle(field: string) {
    switch (field) {
      case 'dataNascita': return 'nascita'
      case 'classe': return 'cls'
      case 'sezione': return 'sez'
      case 'r01': return '1'
      case 'r02': return '2'
      case 'r03': return '3'
      case 'r04': return '4'
      case 'r05': return '5'
      case 'r06': return '6'
      case 'r07': return '7'
      case 'r08': return '8'
      case 'r09': return '9'
      case 'r10': return '10'
      case 'r11': return '11'
      case 'r12': return '12'
      case 'r13': return '13'
      case 'r14': return '14'
      case 'r15': return '15'
      case 'r16': return '16'
      case 'r17': return '17'
      case 'r18': return '18'
      case 'r19': return '19'
      case 'r20': return '20'
      default:
          return field
    }
  }

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
    { Object.entries(schema.fields).map(([field,type]) => <TableCell key={field} field={field} type={type} value={row.data[field]}/>) }
  </tr>
}

function TableCell({field, type, value}:{
  field: string,
  type: string,
  value: string,
}) {
  return <td className={`schema-${field} type-${type}`} key={field}>{value}</td>
}

function InputRow({sheetId, schema, row, done}: {
  sheetId: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow();
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow();
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow(); 
  const [fields, setFields] = useState<Data>(Object.fromEntries(Object.entries(schema.fields).map(
      ([f,t]) => [f, row?.data[f] || ''])))
    
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified();
  const frozenTypes = ['Id', 'Frozen', 'Computed'];

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={99}>Errore: {error.message}</td></tr>

  return <tr className={modified ? "alert": ""}>
    { Object.entries(schema.fields).map(([field,type]) => 
      frozenTypes.includes(type)
        ? <TableCell key={field} field={field} type={type} value={fields[field]||''} />
        : <td key={field} className={`schema-${field} type-${type}`}>
            <InputCell
              type={type}
              value={fields[field]||''} 
              setValue={v => setFields(fields => ({...fields, [field]: v}))}
              onEnter={save}
              />
          </td>
    )}
    <td>
      <button disabled={loading} onClick={save}>salva</button>
      { row?._id && <button disabled={loading} onClick={deleteFunction}>elimina</button>}
    </td>
  </tr>

  function hasBeenModified() {
    for (const field of Object.keys(schema.fields)) {
      if (!row && fields[field] !== '') return true;
      if (row && fields[field] !== row.data[field]) return true;
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
