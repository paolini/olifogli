"use client"
import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, gql, StoreObject } from '@apollo/client';
import CsvImport from '@/app/components/csvImport'
import { availableFields, schemas, Schema, DataRow, AvailableAnswers, AvailableSchemas } from '@/app/lib/schema'
import { Input, ChoiceInput, NumberInput, ScoreInput } from '@/app/components/Input'
import { Row, Info } from '@/app/lib/models'

export interface RowWithId extends DataRow {
    _id: string;
    __typename: string;
}

const GET_ROWS = gql`
  query getRows($sheet_id: ObjectId!) {
    rows(sheet_id: $sheet_id) {
      _id
      is_valid
      updatedOn
      ${availableFields.join('\n')}
      risposte
    }
  }
`;

const ADD_ROW = gql`
  mutation addRow($sheet_id: ObjectId!, $cognome: String!, $nome: String!, $classe: String!, $sezione: String!, $scuola: String!, $data_nascita: String!, $risposte: [String!]!) {
    addRow(sheet_id: $sheet_id, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
      _id
      ${availableFields.join('\n')}
      risposte
    }
  }
`;

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $cognome: String, $nome: String, $classe: String, $sezione: String, $scuola: String, $data_nascita: String, $risposte: [String!]) {
    patchRow(_id: $_id, updatedOn: $updatedOn, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
      _id
      __typename
      updatedOn
      ${availableFields.join('\n')}
      risposte
    }
  }
`;

const DELETE_ROW = gql`
  mutation deleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
  }
`;

export default function Table({sheet_id, schemaName}:{sheet_id: string, schemaName: AvailableSchemas}) {
  const schema = schemas[schemaName];
  const { loading, error, data } = useQuery<{rows:WithId<Row>[]}>(GET_ROWS, {variables: {sheet_id}});
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const [addRow] = useMutation<{ addRow: StoreObject }>(ADD_ROW);

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = data.rows

  return <>
    <table>
      <thead>
        <tr>
            {schema.fields.map(field => <th key={field} className={`schema-${field}`}>{field}</th>)}
            {schema.answers.map((t, i) => <th key={i}>{i+1}</th>)}
          <th>punti</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => row._id === currentRowId 
          ? <InputRow sheet_id={sheet_id} schema={schema} key={row._id.toString()} row={row} done={() => setCurrentRowId(null)}/>
          : <TableRow schema={schema} key={row._id.toString()} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
        ? <tr><td><button onClick={() => setCurrentRowId(null)}>nuova riga</button></td></tr>
        : <InputRow sheet_id={sheet_id} schema={schema}/>}
      </tbody>
    </table>
    csv import<CsvImport 
      columns={schema.fields} 
      numeroRisposte={17}
      addRow={csvAddRow}
      />
  </>

  async function csvAddRow(row: string[]) {
    const data = {
      ...Object.fromEntries(schema.fields.map((f,i) => [f,row[i]])),
      sheet_id,
      risposte: row.slice(6)
    }

    await addRow({
      variables: data,
      update(cache, { data }) {
        if (!data) return;          
        const newRow = data.addRow;        
        cache.modify({
          fields: {
            rows(existingRows = [], { readField }) {
              // Controlla se la riga è già presente per evitare duplicati
              if (existingRows.some((row:StoreObject) => readField("_id", row) === newRow._id)) {
                return existingRows;
              }
              return [...existingRows, cache.writeFragment({
                id: cache.identify(newRow),
                fragment: gql`
                  fragment NewRow on RowWithId {
                    _id
                    __typename
                    ${availableFields.join('\n')}
                    risposte
                  }
                `,
                data: newRow
              })];
            },
          },
        });
      }
    });
  }
}

function TableRow({schema, row, onClick}: {
    schema: Schema,
    row: WithId<Row>, 
    onClick?: () => void,
}) {
  const className = "clickable" + (row.is_valid ? "" : " invalid")

  return <tr className={className} onClick={() => onClick && onClick()}>
    { schema.fields.map(field => <td className={`schema-${field}`} key={field}>{row[field]}</td>) }
    { schema.answers.map((answerType,i) => 
      <td className={`schema-${answerType}`} key={i} style={{width: "8ex"}}>{row.risposte[i]}</td>)}
    <td> {row.punti} </td>
  </tr>
}

function InputRow({sheet_id, schema, row, done}: {
  sheet_id: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useMutation<{ addRow: RowWithId }>(ADD_ROW, {
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

  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = useMutation<{ patchRow: StoreObject }>(PATCH_ROW, {
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

  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useMutation<{ deleteRow: string }>(DELETE_ROW, {
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

  const [fields, setFields] = useState<Info>(Object.fromEntries(schema.fields.map(
      f => [f, row?.[f] || ''])) as Info)
  const [risposte, setRisposte] = useState<string[]>(row?.risposte || schema.answers.map(() => ''))
    
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={99}>Errore: {error.message}</td></tr>

  return <tr>
    { schema.fields.map(field => 
      <td key={field} className={`schema-${field}`}>
        <Input value={fields[field]||''} setValue={v => setFields(fields => ({...fields, [field]: v}))}/>
      </td>
    )}
    { schema.answers.map((t, i) => <InputCell key={i} t={t} risposta={risposte[i]} setRisposta={risposta => setRisposte(old => old.map((r,j) => j===i ? risposta : r))}/>)}
    <td>
      <button disabled={loading} onClick={save}>salva</button>
      { row?._id && <button disabled={loading} onClick={deleteFunction}>elimina</button>}
    </td>
  </tr>

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
        updatedOn: row.updatedOn || new Date(),
        ...fields,
        risposte
      }})
    } else {
      // insert
      await addRow({variables: {
        sheet_id,
        ...fields,
        risposte
      }})
      setFields(fields => ({
        ...fields,
        cognome: '',
        nome: '',
        data_nascita: '',
      }))
      setRisposte(schema.answers.map(() => ''))
    }
    if (done) done()
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
    await deleteRow({variables: { _id: row._id }})
  }
}

function InputCell({t, risposta, setRisposta}: {
  t: AvailableAnswers,
  risposta: string,
  setRisposta: ((risposta: string) => void)
}) {
  return <td>
    { t === 'choice' && <ChoiceInput value={risposta} setValue={setRisposta}/> }
    { t === 'number' && <NumberInput value={risposta} setValue={setRisposta}/> }
    { t === 'score'  && <ScoreInput  value={risposta} setValue={setRisposta}/> }
  </td>
}
