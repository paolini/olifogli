"use client"
import { useState } from 'react'
import { useQuery, useMutation, gql } from '@apollo/client';
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario
import { tipo_risposte, RowWithId } from '@/lib/answers'

import packageJson from '../package.json'
const version = packageJson.version

export default function Home() {
  return <ApolloProviderClient>
    <h1>Olifogli v. {version}</h1>
    <Table />
  </ApolloProviderClient>
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

function Table() {
  const { loading, error, data } = useQuery<{data:RowWithId[]}>(GET_DATA);
  const [ currentRowId, setCurrentRowId ] = useState<string>('')

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen

  return <>
    <table>
      <thead>
        <tr>
          <th>cognome</th>
          <th>nome</th>
          <th>classe</th>
          <th>sezione</th>
          <th>data nascita</th>
          <th>scuola</th>
            {tipo_risposte.map((t, i) => <th key={i}>{t.n}</th>)}
          <th>punti</th>
        </tr>
      </thead>
      <tbody>
        {data.data.map((row) => row._id === currentRowId 
          ? <InputRow key={row._id} row={row} done={() => setCurrentRowId('')}/>
          : <DataRow key={row._id} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
        ? <tr><td><button onClick={() => setCurrentRowId('')}>nuova riga</button></td></tr>
        : <InputRow />}
      </tbody>
    </table>
  </>
}

function DataRow({row, onClick}: {row: RowWithId, onClick?: () => void}) {
  return <tr style={{cursor: "pointer"}} onClick={() => onClick && onClick()}>
    <td>{row.cognome}</td>
    <td>{row.nome}</td>
    <td>{row.classe}</td>
    <td>{row.sezione}</td>
    <td>{row.data_nascita}</td>
    <td>{row.scuola}</td>
    { tipo_risposte.map((t, i) => 
      <td key={i}> {
        ((t, v) => {
            return v
          })(t, row.risposte[i])
        }
      </td>)}
    <td> ?? </td>
  </tr>
}

function InputRow({row, done}: {
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

  const [cognome, setCognome] = useState<string>(row?.cognome || '')
  const [nome, setNome] = useState<string>(row?.nome || '')
  const [classe, setClasse] = useState<string>(row?.classe ? `${row.classe}` : '')
  const [sezione, setSezione] = useState<string>(row?.sezione || '')
  const [data_nascita, setDataNascita] = useState<string>(row?.data_nascita || '')
  const [scuola, setScuola] = useState<string>(row?.scuola || '')
  const [risposte, setRisposte] = useState<string[]>(row?.risposte || tipo_risposte.map(() => ''))

  return <tr>
    <td><Input value={cognome} setValue={setCognome}/></td>
    <td><Input value={nome} setValue={setNome}/></td>
    <td><Input value={classe} setValue={v => setClasse(v)} size={2} width="2em"/></td>
    <td><Input value={sezione} setValue={setSezione} size={2} width="2em"/></td>
    <td><Input value={data_nascita} setValue={setDataNascita} size={8} width="6em"/></td>
    <td><Input value={scuola} setValue={setScuola}/></td>
    { tipo_risposte.map((t, i) => <td key={i}>{
        ((t,v) => {
          switch (t.t) {

            case 'choice': return <ChoiceInput value={v} setValue={setValueC}/>
            case 'number': return <NumberInput value={v} setValue={setValueN}/>
            case 'score': return <ScoreInput value={v} setValue={setValueS}/>
            default:
              return '???'
          }

          function setValueC(value: string) {
	    switch (value) {

	      case 'A':
	      case 'B':
	      case 'C':
	      case 'D':
	      case 'E':
	      case '-':
	      case 'X': 
	        setRisposte(r => [...r.slice(0, i), value, ...r.slice(i+1)])
	        //t.next("input").focus()
	        const active = document.activeElement;
  		if (active?.nextElementSibling) {
    		  (active.nextElementSibling as HTMLElement).focus();
  		}
	      case '':
	        setRisposte(r => [...r.slice(0, i), value, ...r.slice(i+1)])
	      default:
	    }
          }

          function setValueN(value: string) {
            setRisposte(r => [...r.slice(0, i), value, ...r.slice(i+1)])
          }

          function setValueS(value: string) {
            setRisposte(r => [...r.slice(0, i), value, ...r.slice(i+1)])
          }

        })(t, risposte[i])
      }
    </td>)}
    <td><button disabled={loading} onClick={save}>salva</button></td>
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
    }
    done && done()
  }
}

function ChoiceInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input style={{width: "1.2em", textAlign:"center"}}type="text" value={value} size={1} onChange={(e) => setValue(e.target.value)} />
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

