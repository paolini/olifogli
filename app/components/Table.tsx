"use client"
import { useState } from 'react'
import { useQuery, useMutation, gql, StoreObject } from '@apollo/client';
import CsvImport from '@/app/components/csvImport'
import { schemas, Schema, Info, DataRow, AvailableAnswers, AvailableSchemas } from '@/app/lib/schema'
import { Input, ChoiceInput, NumberInput, ScoreInput } from '@/app/components/Input'

export interface RowWithId extends DataRow {
    _id: string;
}

const GET_ROWS = gql`
  query getRows($sheet_id: ObjectId!) {
    rows(sheet_id: $sheet_id) {
      _id
      isValid
      updatedOn
      cognome
      nome
      classe
      sezione
      scuola
      data_nascita
      risposte
    }
  }
`;

const ADD_ROW = gql`
  mutation addRow($sheet_id: ObjectId!, $cognome: String!, $nome: String!, $classe: String!, $sezione: String!, $scuola: String!, $data_nascita: String!, $risposte: [String!]!) {
    addRow(sheet_id: $sheet_id, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
      _id
      cognome
      nome
      classe
      sezione
      scuola
      data_nascita
      risposte
    }
  }
`;

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $cognome: String, $nome: String, $classe: String, $sezione: String, $scuola: String, $data_nascita: String, $risposte: [String!]) {
    patchRow(_id: $_id, updatedOn: $updatedOn, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
      _id
      updatedOn
      cognome
      nome
      classe
      sezione
      scuola
      data_nascita
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
  const { loading, error, data } = useQuery<{rows:RowWithId[]}>(GET_ROWS, {variables: {sheet_id}});
  const [ currentRowId, setCurrentRowId ] = useState<string>('')
  const [addRow] = useMutation<{ addRow: RowWithId }>(ADD_ROW);

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
          ? <InputRow sheet_id={sheet_id} schema={schema} key={row._id} row={row} done={() => setCurrentRowId('')}/>
          : <TableRow schema={schema} key={row._id} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
        ? <tr><td><button onClick={() => setCurrentRowId('')}>nuova riga</button></td></tr>
        : <InputRow sheet_id={sheet_id} schema={schema}/>}
      </tbody>
    </table>
    <CsvImport 
      columns={schema.fields} 
      numeroRisposte={17}
      addRow={csvAddRow}
      />
  </>

  async function csvAddRow(row: string[]) {
    const data = {
      cognome: row[0],
      nome: row[1],
      classe: row[2],
      sezione: row[3],
      data_nascita: row[4],
      scuola: row[5],
      risposte: row.slice(6)
    }

    await addRow({
      variables: data,
      update(cache, { data }) {
        const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_ROWS });
        if (existingRows && data) {
          cache.writeQuery({
            query: GET_ROWS,
            data: {
              data: [...existingRows.data, data.addRow],
            },
          });
        }
      }
    });

   }
}

function TableRow({schema, row, onClick}: {
    schema: Schema,
    row: RowWithId, 
    onClick?: () => void,
}) {
  const className = "clickable" + (schema.isValid(row) ? "" : " invalid")

  return <tr className={className} onClick={() => onClick && onClick()}>
    { schema.fields.map(field => <td key={field}>{row[field]}</td>) }
    { schema.answers.map((answerType,i) => 
      <td className={`schema-${answerType}`} key={i} style={{width: "8ex"}}>{row.risposte[i]}</td>)}
    <td> {schema.computeScore(row)} </td>
  </tr>
}

function InputRow({sheet_id, schema, row, done}: {
  sheet_id: string,
  schema: Schema, 
  row?: RowWithId,
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

  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = useMutation<{ patchRow: RowWithId }>(PATCH_ROW, {
    update(cache, { data }) {
      // Recupera i dati attuali dalla cache
      const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_ROWS });

      // Aggiorna manualmente l'elenco
      if (existingRows && data) {
        cache.writeQuery({
          query: GET_ROWS,
          data: {
            data: existingRows.data.map(row => (row._id === data.patchRow._id ? data.patchRow : row))
          },
        });
      }
    }});

  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useMutation<{ deleteRow: string }>(DELETE_ROW, {
    update(cache, { data }) {
      // Recupera i dati attuali dalla cache
      const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_ROWS });

      // Aggiorna manualmente l'elenco
      if (existingRows && data) {
        console.log(`deleting row from cache`, data.deleteRow)
        cache.writeQuery({
          query: GET_ROWS,
          data: {
            data: existingRows.data.filter(row => row._id !== data.deleteRow),
          },
        });
      }
    }});

  const [fields, setFields] = useState<Info>(Object.fromEntries(schema.fields.map(
      f => [f, row?.[f] || ''])))
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

