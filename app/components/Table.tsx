"use client"
import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, StoreObject, gql } from '@apollo/client';
import { Schema, DataRow, availableFields, schemas, AvailableAnswers, AvailableSchemas, AvailableFields } from '@/app/lib/schema'
import { Input, ChoiceInput, NumberInput, ScoreInput } from '@/app/components/Input'
import { Row, Info } from '@/app/lib/models'

export interface RowWithId extends DataRow {
    _id: string;
    __typename: string;
}

type CriterioOrd = {
  numcampo?: number,
  nomecampo: AvailableFields,
  direzione: number
}

type CriterioCerca = {
  nomecampo: AvailableFields,
  value: string
}

const criterioStandard: CriterioOrd = {numcampo: 0, nomecampo: "cognome", direzione: 1}
const criterioStandard2: CriterioOrd = {numcampo: 1, nomecampo: "nome", direzione: 1}

const GET_ROWS = gql`
  query getRows($sheetId: ObjectId!) {
    rows(sheetId: $sheetId) {
      _id
      isValid
      punti
      updatedOn
      ${availableFields.join('\n')}
      risposte
    }
  }
`;

export const ADD_ROW = gql`
  mutation addRow($sheetId: ObjectId!, $cognome: String!, $nome: String!, $classe: String!, $sezione: String!, $scuola: String!, $dataNascita: String!, $risposte: [String!]!) {
    addRow(sheetId: $sheetId, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, dataNascita: $dataNascita, risposte: $risposte) {
      _id
      isValid
      punti
      ${availableFields.join('\n')}
      risposte
    }
  }
`;

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $cognome: String, $nome: String, $classe: String, $sezione: String, $scuola: String, $dataNascita: String, $risposte: [String!]) {
    patchRow(_id: $_id, updatedOn: $updatedOn, cognome: $cognome, nome: $nome, classe: $classe, sezione: $sezione, scuola: $scuola, dataNascita: $dataNascita, risposte: $risposte) {
      _id
      __typename
      updatedOn
      isValid
      punti
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

export default function Table({sheetId, schemaName}:{sheetId: string, schemaName: AvailableSchemas}) {
  const schema = schemas[schemaName];
  const { loading, error, data } = useQuery<{rows:WithId<Row>[]}>(GET_ROWS, {variables: {sheetId}});
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const [criteriCerca, setCriteriCerca] = useState<CriterioCerca[]>([])
  const [criteriOrdina, setCriteriOrdina] = useState<CriterioOrd[]>([criterioStandard, criterioStandard2])
//  const [inputAttivo, setInputAttivo] = useState<object>({})

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = data.rows

//  function componentDidMount(){
//    if (inputAttivo) {
//      inputAttivo.focus()
//    }
//  }

  function confronta(campo: string, camporow1: string, camporow2: string): number {
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
  

  function confrontaCriteri(row1: WithId<Row>, row2: WithId<Row>): number {
    let i: number = 0
    let res: number = 0

    while (i < criteriOrdina.length) {
      res = confronta(criteriOrdina[i].nomecampo, row1[criteriOrdina[i].nomecampo] || "", row2[criteriOrdina[i].nomecampo] || "")
      if (! (res == 0)) {
        return res * criteriOrdina[i].direzione
      }
      i++
    }
    return res
  }

  function tableOrdina(rows: WithId<Row>[]): WithId<Row>[] {
    const rowssort: WithId<Row>[] = [...rows]
    rowssort.sort((a: WithId<Row>, b: WithId<Row>) => confrontaCriteri(a, b))
//    rowssort.unshift(row0)
    return (
      (criteriOrdina.length == 0)? rows : rowssort
    )
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

  function TableCerca(rows: WithId<Row>[]): WithId<Row>[] {
    let rowsOk: WithId<Row>[] = [...rows]
    if (criteriCerca.length >= 0) {
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => (riga[a.nomecampo]||'').includes(a.value) )})
    }
    return rowsOk
  }

  const rowsToDisplay: WithId<Row>[] = TableCerca(rows)
  const rowsDisplay: WithId<Row>[] = tableOrdina(rowsToDisplay)

  return <>
    {/*<pre>{JSON.stringify(inputAttivo.id)}</pre>*/}
    <span>Ordinamento per {criteriOrdina.map(a => a.direzione > 0? a.nomecampo + ":asc" + "  " : a.nomecampo + ":disc").join("  ")}</span>
    <table>
      <thead>
        <tr>
            {schema.fields.map(field => 
              <th scope="col" key={field} className={`schema-${field}`}>
              {columnTitle(field)}&nbsp;
                <CambiaOrdine
                  nomecampo={field}
                  aggiornaCriteriOrdina={aggiornaCriteriOrdina}
                />
              </th>)}
            {schema.answers.map((t, i) => <th scope="col" key={i}>{i+1}</th>)}
          <th>punti</th>
        </tr>
        <tr>
            {schema.fields.map(field => <th key={"cerca"+field}>
            <InputCerca 
              nomecampo={field} 
              value={criteriCerca.filter(crit => crit["nomecampo"] == field).length > 0 ? criteriCerca.filter(crit => crit["nomecampo"] == field)[0].value : ""}
              aggiornaCriteriCerca={aggiornaCriteriCerca}
            /></th>)}
            {schema.answers.map((t, i) => <th key={i}>&nbsp;</th>)}
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        { rowsDisplay.map((row) => row._id === currentRowId 
        ? <InputRow sheetId={sheetId} schema={schema} key={row._id.toString()} row={row} done={() => setCurrentRowId(null)}/>
        : <TableRow schema={schema} key={row._id.toString()} row={row} onClick={() => setCurrentRowId(row._id)} />
        )}
        {currentRowId 
        ? <tr><td><button onClick={() => setCurrentRowId(null)}>nuova riga</button></td></tr>
        : <InputRow sheetId={sheetId} schema={schema}/>}
      </tbody>
    </table>
  </>

  function columnTitle(field: AvailableFields) {
    switch (field) {
      case 'dataNascita': return 'nascita'
      case 'classe': return 'cls'
      case 'sezione': return 'sez'
      default:
          return field
    }
  }
}

function InputCerca({size, value, aggiornaCriteriCerca, // setValue, 
  width, nomecampo}:{
  //type?: string, 
  size?: number, 
  value: string, 
  width?: string,
//    setValue?: (value: string) => void,
  nomecampo: AvailableFields,
  aggiornaCriteriCerca: (nomecampo: AvailableFields, value: string) => void
}) {

  function Battuta(e: React.ChangeEvent<HTMLInputElement>) {
    aggiornaCriteriCerca(nomecampo, e.target.value)
    //setInputAttivo(e.target)
  }

//    return <><input ref={input => input && input.focus()} type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} nomecampo={nomecampo as string} /> </>
  return <input type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} placeholder="cerca"/>
}



function CambiaOrdine({ nomecampo, aggiornaCriteriOrdina } : { 
  nomecampo: AvailableFields,
  aggiornaCriteriOrdina: (nomecampo: AvailableFields) => void
} ) {
return <span onClick={() => aggiornaCriteriOrdina(nomecampo)}>&plusmn;</span>
}

function TableRow({schema, row, onClick}: {
    schema: Schema,
    row: WithId<Row>, 
    onClick?: () => void,
}) {
  const className = `clickable${row.isValid ? "" : " alert"}`

  return <tr className={className} onClick={() => onClick && onClick()}>
    {/*<td><pre>{JSON.stringify({row})}</pre></td>*/}
    { schema.fields.map(field => <td className={`schema-${field}`} key={field}>{row[field]}</td>) }
    { schema.answers.map((answerType,i) => 
      <td className={`schema-${answerType}`} key={i} style={{width: "8ex"}}>{row.risposte[i]}</td>)}
    <td> {row.punti} </td>
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
  const [fields, setFields] = useState<Info>(Object.fromEntries(schema.fields.map(
      f => [f, row?.[f] || ''])) as Info)
  const [risposte, setRisposte] = useState<string[]>(row?.risposte || schema.answers.map(() => ''))
    
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified();

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={99}>Errore: {error.message}</td></tr>

  return <tr className={modified ? "alert": ""}>
    { schema.fields.map(field => 
      <td key={field} className={`schema-${field}`}>
        <Input 
          value={fields[field]||''} 
          setValue={v => setFields(fields => ({...fields, [field]: v}))}
          onEnter={save}
          />
      </td>
    )}
    { schema.answers.map((t, i) => 
      <InputCell 
        key={i} 
        t={t} 
        risposta={risposte[i]} 
        setRisposta={risposta => setRisposte(old => old.map((r,j) => j===i ? risposta : r))}
        onEnter={save}
        />)}
    <td>
      <button disabled={loading} onClick={save}>salva</button>
      { row?._id && <button disabled={loading} onClick={deleteFunction}>elimina</button>}
    </td>
  </tr>

  function hasBeenModified() {
    for (const field of schema.fields) {
      if (!row && fields[field] !== '') return true;
      if (row && fields[field] !== row[field]) return true;
    }
    for (let i=0; i<schema.answers.length; ++i) {
      if (!row && risposte[i] !== '') return true;
      if (row && risposte[i] != row.risposte[i]) return true;
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
        updatedOn: row.updatedOn || new Date(),
        ...fields,
        risposte
      }})
    } else {
      // insert
      await addRow({variables: {
        sheetId,
        ...fields,
        risposte
      }})
      setFields(fields => ({
        ...fields,
        cognome: '',
        nome: '',
        dataNascita: '',
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

function InputCell({t, risposta, setRisposta, onEnter}: {
  t: AvailableAnswers,
  risposta: string,
  setRisposta: ((risposta: string) => void),
  onEnter?: () => void,
}) {
  return <td>
    { t === 'choice' && <ChoiceInput value={risposta} setValue={setRisposta} onEnter={onEnter}/> }
    { t === 'number' && <NumberInput value={risposta} setValue={setRisposta} onEnter={onEnter}/> }
    { t === 'score'  && <ScoreInput  value={risposta} setValue={setRisposta} onEnter={onEnter}/> }
  </td>
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