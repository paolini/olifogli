"use client"
import { useState } from 'react'
import { useQuery, useMutation, gql } from '@apollo/client';
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario
import { tipo_risposte, RowWithId, TipoRisposta } from '@/lib/answers'
import CsvImport from '@/app/components/csvImport'

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
  const [addRow] = useMutation<{ addRow: RowWithId }>(ADD_ROW);


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
    <CsvImport 
      columns={["cognome", "nome", "classe", "sezione", "data_nascita", "scuola"]} 
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

function DataRow({row, onClick}: {row: RowWithId, onClick?: () => void}) {

  // per ora non usata, ma per il futuro, quando vorremo mostrare (anche)
  // le risposte e/o i punteggi depermutati
  //
  function depermutaRisposte(risposte: [String], codice: string) {
    const permutazioniDom = {"GD":{1: 1,2: 2,3: 3,4: 4,5: 5,6: 6,7: 7,8: 8,9: 9,10: 10,11: 11,12: 12}}
    const permutazioniRisp = {"GD":{"A":"A","B":"B","C":"C","D":"D","E":"E"}}
    return tipo_risposte.map((tipoRisp) => {
      switch (tipoRisp.t) {
        case "choice":
	  return permutazioniRisp[codice][risposte[permutazioniDom[codice][tipoRisp.n]-1]]
	case "number":
	case "score":
	  return risposte[tipoRisp.n-1]
      }
    })
  }

  function calcolaPunteggi(risposte: [String]) {
    const punteggioRisp = {choice: {giusta: 5, vuotanulla: 1, errata: 0}, number: {giusta: 5, vuotanulla: 1, errata: 0}, score: {giusta: "x", vuotanulla: 0, errata: 0}}
    const risposteNeutre = {choice:["-", "X"], number:["-"], score: []}
    const permutazioniDom = {"GD":{1: 1,2: 2,3: 3,4: 4,5: 5,6: 6,7: 7,8: 8,9: 9,10: 10,11: 11,12: 12}}
    const permutazioniRisp = {"GD":{"A":"A","B":"B","C":"C","D":"D","E":"E"}}
    const risposteCorrette = ["C","A","C","C","A","C","A","C","C","A","C","A",1234,1111,"*","*","*"]
    const testo = "GD"
    const rispostedeperm = depermutaRisposte(risposte, "GD")
 
    return tipo_risposte.map((tipoRisp) => {
      switch (tipoRisp.t) {
        case "choice": 
 	case "number":
 	  if (risposteNeutre[tipoRisp.t].includes(risposte[tipoRisp.n-1])) {
	    return punteggioRisp[tipoRisp.t]["vuotanulla"] 
	  } else if (risposte[tipoRisp.n-1] == permutazioniRisp[testo][risposteCorrette[permutazioniDom[testo][tipoRisp.n]-1]]) {
	    return punteggioRisp[tipoRisp.t]["giusta"]
          } else {
 	    return punteggioRisp[tipoRisp.t]["errata"]
          }
          break
        case "score": 
	  return risposte[tipoRisp.n-1]*1
      }
    })
  }
  function calcolaPunteggio(risposte: [String]) {
    if (risposte.includes("") == false) {
      const punteggi = calcolaPunteggi(risposte)
      const punteggio = punteggi.reduce((a,b) => a + b, 0)
      return punteggio
    } else {
      return "---"
    }
  }

  function nonValida(row: RowWithId) {
    return row.risposte.includes("")
  }

//  return <tr style={ { cursor: "pointer" nonValida(row) ? ', backgroundColor: "00ffff"' : '' } } onClick={() => onClick && onClick()}>
//  return <tr style={ { cursor: "pointer" } } onClick={() => onClick && onClick()}>
  return <tr style={ nonValida(row)? { cursor: "pointer", backgroundColor: "darkslategray" } : { cursor: "pointer" } } onClick={() => onClick && onClick()}>
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
    <td> {calcolaPunteggio(row.risposte)} </td>
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
    { tipo_risposte.map((t, i) => <InputCell key={i} t={t} risposta={risposte[i]} setRisposta={risposta => setRisposte(old => old.map((r,j) => j===i ? risposta : r))}/>)}
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
      setCognome('')
      setNome('')
      setDataNascita('')
      setRisposte(tipo_risposte.map(() => ''))
    }
    if (done) done()
  }
}

function InputCell({t, risposta, setRisposta}: {
  t: TipoRisposta,
  risposta: string,
  setRisposta: ((risposta: string) => void)
}) {
  return <td>
    { t.t === 'choice' && <ChoiceInput value={risposta} setValue={setRisposta}/> }
    { t.t === 'number' && <NumberInput value={risposta} setValue={setRisposta}/> }
    { t.t === 'score'  && <ScoreInput  value={risposta} setValue={setRisposta}/> }
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

