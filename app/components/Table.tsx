"use client"
import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, StoreObject, gql } from '@apollo/client';
import { Schema, schemas, AvailableSchemas } from '@/app/lib/schema'
import { InputCell } from '@/app/components/Input'
import { Row, Data } from '@/app/lib/models'
import { Ordering, CambiaOrdine, InputCerca, useCriteria, filtraEOrdina } from '@/app/components/Ordering'

export interface RowWithId extends Row {
    _id: string;
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

export default function Table({sheetId, schemaName}:{sheetId: string, schemaName: AvailableSchemas}) {
  const schema = schemas[schemaName];
  const { loading, error, data } = useQuery<{rows:WithId<Row>[]}>(GET_ROWS, {variables: {sheetId}});
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const criteria = useCriteria()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = filtraEOrdina(criteria, data.rows)

  return <>
    {/*<pre>{JSON.stringify(inputAttivo.id)}</pre>*/}
    <span>{rows.length} righe</span>
    {rows.length < data.rows.length && <span>({rows.length} visualizzate)</span>}
    <br />
    <Ordering criteria={criteria}/>
    <table>
      <thead>
        <tr>
            {Object.entries(schema.fields).map(([field,type]) => 
              <th scope="col" key={field} className={`schema-${field} type-${type}`}>
              {columnTitle(field)}&nbsp;
                <CambiaOrdine
                  field={field}
                  type={type}
                  criteria={criteria}
                />
              </th>)}
        </tr>
        <tr>
            {Object.entries(schema.fields).map(([field,type]) => <th key={"cerca"+field}>
              <InputCerca 
                field={field}
                type={type}
                criteria={criteria}
              /> 
              </th>)}
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        { rows.map((row) => row._id === currentRowId 
        ? <InputRow sheetId={sheetId} schema={schema} key={row._id.toString()} row={row} done={() => setCurrentRowId(null)}/>
        : <TableRow schema={schema} key={row._id.toString()} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
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
}

function TableRow({schema, row, onClick}: {
    schema: Schema,
    row: WithId<Row>, 
    onClick?: () => void,
}) {
  const className = `clickable${row.isValid ? "" : " alert"}`

  return <tr className={className} onClick={() => onClick && onClick()}>
    { Object.entries(schema.fields).map(([field,type]) => <td className={`schema-${field} type-${type}`} key={field}>{row.data[field]}</td>) }
  </tr>
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

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={99}>Errore: {error.message}</td></tr>

  return <tr className={modified ? "alert": ""}>
    { Object.entries(schema.fields).map(([field,type]) => 
      <td key={field} className={`schema-${field} type-${type}`}>
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