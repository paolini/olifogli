"use client"
import { useState } from 'react'
import { useQuery, useMutation, gql } from '@apollo/client';
import CsvImport from '@/app/components/csvImport'
import { Schema, DataRow, AvailableAnswers } from '@/lib/schema'

export interface RowWithId extends DataRow {
    _id: string;
}

const GET_DATA = gql`
  query{
    data {
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

const ADD_ROW = gql`
  mutation addRow($cognome: String!, $nome: String!, $classe: String!, $sezione: String!, $scuola: String!, $data_nascita: String!, $risposte: [String!]!) {
    addRow(cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
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

const UPDATE_ROW = gql`
  mutation updateRow($_id: String!, $cognome: String!, $nome: String!, $classe: String!, $sezione: String!, $scuola: String!, $data_nascita: String!, $risposte: [String!]!) {
    updateRow(_id: $_id, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, data_nascita: $data_nascita, risposte: $risposte) {
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

const DELETE_ROW = gql`
  mutation deleteRow($_id: String!) {
    deleteRow(_id: $_id)
  }
`;

export default function Table({schema}:{schema:Schema}) {
  const { loading, error, data } = useQuery<{data:RowWithId[]}>(GET_DATA);
  const [ currentRowId, setCurrentRowId ] = useState<string>('')
  const [addRow] = useMutation<{ addRow: RowWithId }>(ADD_ROW);

  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = data.data

  return <>
    <table>
      <thead>
        <tr>
            {schema.fields.map(field => <th key={field}>{field}</th>)}
            {schema.answers.map((t, i) => <th key={i}>{i+1}</th>)}
          <th>punti</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => row._id === currentRowId 
          ? <InputRow schema={schema} key={row._id} row={row} done={() => setCurrentRowId('')}/>
          : <TableRow schema={schema} key={row._id} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
        ? <tr><td><button onClick={() => setCurrentRowId('')}>nuova riga</button></td></tr>
        : <InputRow schema={schema}/>}
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
        const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_DATA });
        if (existingRows && data) {
          cache.writeQuery({
            query: GET_DATA,
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
      <td key={i}>{row.risposte[i]}</td>)}
    <td> {schema.computeScore(row)} </td>
  </tr>
}

function InputRow({schema, row, done}: {
  schema: Schema, 
  row?: RowWithId,
  done?: () => void
}) {
  const [addRow, {loading, error}] = useMutation<{ addRow: RowWithId }>(ADD_ROW, {
    update(cache, { data }) {
      // Recupera i dati attuali dalla cache
      const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_DATA });

      // Aggiorna manualmente l'elenco
      if (existingRows && data) {
        cache.writeQuery({
          query: GET_DATA,
          data: {
            data: [...existingRows.data, data.addRow],
          },
        });
      }
    }});

  const [updateRow] = useMutation<{ updateRow: RowWithId }>(UPDATE_ROW, {
    update(cache, { data }) {
      // Recupera i dati attuali dalla cache
      const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_DATA });

      // Aggiorna manualmente l'elenco
      if (existingRows && data) {
        cache.writeQuery({
          query: GET_DATA,
          data: {
            data: existingRows.data.map(row => row._id === data.updateRow._id ? data.updateRow : row),
          },
        });
      }
    }});

  const [deleteRow] = useMutation<{ deleteRow: string }>(DELETE_ROW, {
    update(cache, { data }) {
      // Recupera i dati attuali dalla cache
      const existingRows = cache.readQuery<{ data: RowWithId[] }>({ query: GET_DATA });

      // Aggiorna manualmente l'elenco
      if (existingRows && data) {
        console.log(`deleting row from cache`, data.deleteRow)
        cache.writeQuery({
          query: GET_DATA,
          data: {
            data: existingRows.data.filter(row => row._id !== data.deleteRow),
          },
        });
      }
    }});

  const [cognome, setCognome] = useState<string>(row?.cognome || '')
  const [nome, setNome] = useState<string>(row?.nome || '')
  const [classe, setClasse] = useState<string>(row?.classe ? `${row.classe}` : '')
  const [sezione, setSezione] = useState<string>(row?.sezione || '')
  const [data_nascita, setDataNascita] = useState<string>(row?.data_nascita || '')
  const [scuola, setScuola] = useState<string>(row?.scuola || '')
  const [risposte, setRisposte] = useState<string[]>(row?.risposte || schema.answers.map(() => ''))

  return <tr>
    <td><Input value={cognome} setValue={setCognome}/></td>
    <td><Input value={nome} setValue={setNome}/></td>
    <td><Input value={classe} setValue={v => setClasse(v)} size={2} width="2em"/></td>
    <td><Input value={sezione} setValue={setSezione} size={2} width="2em"/></td>
    <td><Input value={data_nascita} setValue={setDataNascita} size={8} width="6em"/></td>
    <td><Input value={scuola} setValue={setScuola}/></td>
    { schema.answers.map((t, i) => <InputCell key={i} t={t} risposta={risposte[i]} setRisposta={risposta => setRisposte(old => old.map((r,j) => j===i ? risposta : r))}/>)}
    <td>
      <button disabled={loading} onClick={save}>salva</button>
      { row?._id && <button disabled={loading} onClick={deleteFunction}>elimina</button>}
    </td>
    <td>{error && error.message}</td>
  </tr>

  async function save() {
    if (row?._id) {
      // update
      await updateRow({variables: {
        _id: row._id,
        cognome,
        nome,
        classe,
        sezione,
        data_nascita,
        scuola,
        risposte
      }})
    } else {
      // insert
      await addRow({variables: {
        cognome,
        nome,
        classe,
        sezione,
        data_nascita,
        scuola,
        risposte
      }})
      setCognome('')
      setNome('')
      setDataNascita('')
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

function ChoiceInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input style={{width: "1.2em", textAlign:"center"}}type="text" value={value} size={1} onChange={onChange} />

  function clean(value: string) {
    if (value.length === 0) return ''
    value = value.slice(-1) // last char
    value = value.toUpperCase()
    if (!"ABCDE-X".includes(value.toUpperCase())) return ''
    return value
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = clean(e.target.value)
    setValue(value)
    if (value.length>0) {
      const td = e.target.closest("td"); // Trova la cella <td> in cui si trova l'input
      const next_td = td?.nextElementSibling; // Trova la cella successiva
      const next_input = next_td?.querySelector("input"); // Trova l'input nella cella successiva
      if (next_input) (next_input as HTMLElement).focus();
    }
  }
}

function NumberInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "3em"}}/>
}

function ScoreInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={2} onChange={(e) => setValue(e.target.value)} style={{width: "2em"}}/>
}

function Input({type, size, value, setValue, width}:{
  type?: string, 
  size?: number, 
  value: string, 
  width?: string,
  setValue?: (value: string) => void
}) {
  return <input type={type} width={width} size={size} value={value} onChange={e => setValue && setValue(e.target.value)} />
}

