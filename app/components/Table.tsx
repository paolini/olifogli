"use client"
import { useState } from 'react'
import { useQuery, useMutation, gql } from '@apollo/client';
import CsvImport from '@/app/components/csvImport'
import { Schema, DataRow, AvailableAnswers, AvailableFields } from '@/lib/schema'

export interface RowWithId extends DataRow {
    _id: string;
}

type CriterioOrd = {
  numcampo: number,
  nomecampo: AvailableFields,
  direzione: number
}

type CriterioCerca = {
  nomecampo: AvailableFields,
  value: string
}

const criterioStandard: CriterioOrd = {numcampo: 0, nomecampo: "cognome", direzione: 1}
const criterioStandard2: CriterioOrd = {numcampo: 1, nomecampo: "nome", direzione: 1}

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
  const [criteriCerca, setCriteriCerca] = useState<CriterioCerca[]>([])
  const [criteriOrdina, setCriteriOrdina] = useState<CriterioOrd[]>([criterioStandard, criterioStandard2])
  const [inputAttivo, setInputAttivo] = useState<object>({})

  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = data.data

//  function componentDidMount(){
//    if (inputAttivo) {
//      inputAttivo.focus()
//    }
//  }

  function Confronta(campo: string, camporow1: string, camporow2: string): number {
    const campiStringhe: string[] = ["nome", "cognome", "sezione"]
    const campiNumero: string[] = ["classe", "codice", "punteggio"]
    const campiData: string[] = ["data_nascita"]

    if (campiStringhe.includes(campo)) {
      return (
        (camporow1.toUpperCase() > camporow2.toUpperCase())? 1 :
          (camporow1.toUpperCase() < camporow2.toUpperCase())?  -1 : 0
      )
    }
    if (campiNumero.includes(campo)) {
      return (
        (parseFloat(camporow1) - parseFloat(camporow2) > 0)? 1 :
          (parseFloat(camporow1) - parseFloat(camporow2) < 0)? -1 : 0
      )
    }
    if (campiData.includes(campo)) {
      return (
        (Date.parse(camporow1) > Date.parse(camporow2))? 1 :
          (Date.parse(camporow1) < Date.parse(camporow2))? -1 : 0
      )
    }
    return 0
  }
  

  function ConfrontaCriteri(row1: RowWithId, row2: RowWithId): number {
    let i: number = 0
    let res: number = 0

    while (i < criteriOrdina.length) {
      res = Confronta(criteriOrdina[i].nomecampo, row1[criteriOrdina[i].nomecampo] || "", row2[criteriOrdina[i].nomecampo] || "")
      if (! (res == 0)) {
        return res * criteriOrdina[i].direzione
      }
      i++
    }
    return res
  }

  function TableOrdina(rows: RowWithId[]): RowWithId[] {
    const rowssort: RowWithId[] = [...rows]
    rowssort.sort((a: RowWithId, b: RowWithId) => ConfrontaCriteri(a, b))
//    rowssort.unshift(row0)
    return (
      (criteriOrdina.length == 0)? rows : rowssort
    )
  }

  function CambiaOrdine({ nomecampo } : { nomecampo: AvailableFields} ): void {

    function cambiaOrd() {
      aggiornaCriteriOrdina(nomecampo)
    }

    return <span onClick={cambiaOrd}>&plusmn;</span>
  }

  function aggiornaCriteriOrdina(nomecampo: AvailableFields): void {
    let i: number
    let cera: boolean = false
    const critOrdina: CriterioOrd[] = [...criteriOrdina]

    for (i = 0; i < critOrdina.length; i++) {
      if (critOrdina[i]["nomecampo"] == nomecampo) {
        cera = true
        if (critOrdina[i]["direzione"] > 0) {
          critOrdina[i]["direzione"] = -1
          setCriteriOrdina([...critOrdina])
        } else {
          setCriteriOrdina([...critOrdina.slice(0,i), ...critOrdina.slice(i + 1)])
        break
        }
      }
    }
    if (cera == false) {
      setCriteriOrdina([...critOrdina, {nomecampo: nomecampo, direzione: 1}])
    }
  }

  function aggiornaCriteriCerca(nomecampo: AvailableFields, value: string): void {
    let i: number
    let cera: boolean = false
    const critCerca: CriterioCerca[] = [...criteriCerca]
    for (i = 0; i < critCerca.length; i++) {
      if (critCerca[i]["nomecampo"] == nomecampo) {
        cera = true
        if (value != "") {
          critCerca[i]["value"] = value
          setCriteriCerca([...critCerca])
          break
        } else {
          setCriteriCerca([...critCerca.slice(0,i), ...critCerca.slice(i + 1)])
        }
      }
    }
    if (cera == false) {
      setCriteriCerca([...critCerca, {nomecampo: nomecampo, value: value}])
    }
  }

  function TableCerca(rows: RowWithId[]): RowWithId[] {
    let rowsOk: RowWithId[] = [...rows]
    if (criteriCerca.length >= 0) {
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => riga[a.nomecampo].includes(a.value) )})
    }
    return rowsOk
  }

  function InputCerca({size, value,// setValue, 
    width, nomecampo}:{
    //type?: string, 
    size?: number, 
    value: string, 
    width?: string,
//    setValue?: (value: string) => void,
    nomecampo: AvailableFields
  }) {

    function Battuta(e: React.ChangeEvent<HTMLInputElement>) {
      aggiornaCriteriCerca(nomecampo as string, e.target.value)
      setInputAttivo(e.target)
    }

//    return <><input ref={input => input && input.focus()} type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} nomecampo={nomecampo as string} /> </>
    return <><input type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} nomecampo={nomecampo as string} /> </>
  }

  const rowsToDisplay: RowWithId[] = TableCerca(rows)
  const rowsDisplay: RowWithId[] = TableOrdina(rowsToDisplay)

  return <>
    <pre>{JSON.stringify(inputAttivo.id)}</pre>
    <span>Ordinamento per {criteriOrdina.map(a => a.direzione > 0? a.nomecampo + ":asc" + "  " : a.nomecampo + ":disc").join("  ")}</span>
    <table>
      <thead>
        <tr>
            {schema.fields.map(field => <th scope="col" key={field}>{field}&nbsp;
            <CambiaOrdine
               nomecampo={field}
            />
            </th>)
            }
            {schema.answers.map((t, i) => <th scope="col" key={i}>{i+1}</th>)}
          <th>punti</th>
        </tr>
        <tr>
            {schema.fields.map(field => <th key={"cerca"+field}>
            <InputCerca 
              type="text" 
              nomecampo={field} 
              placeholder="cerca" 
              value={criteriCerca.filter(crit => crit["nomecampo"] == field).length > 0 ? criteriCerca.filter(crit => crit["nomecampo"] == field)[0].value : ""}
            /></th>)}
            {schema.answers.map((t, i) => <th key={i}>&nbsp;</th>)}
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {
          rowsDisplay.map((row) => row._id === currentRowId 
          ? <InputRow schema={schema} key={row._id} row={row} done={() => setCurrentRowId('')}/>
          : <TableRow schema={schema} key={row._id} row={row} onClick={() => setCurrentRowId(row._id)} />
          )
        }
        {
          currentRowId 
          ? <tr><td><button onClick={() => setCurrentRowId('')}>nuova riga</button></td></tr>
          : <InputRow schema={schema}/>
        }
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

