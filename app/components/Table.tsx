"use client"
import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, useMutation, StoreObject, gql } from '@apollo/client';
import { Schema, schemas, AvailableSchemas } from '@/app/lib/schema'
import { InputCell } from '@/app/components/Input'
import { Row, Data } from '@/app/lib/models'

export interface RowWithId extends Row {
    _id: string;
    __typename: string;
}

type CriterioOrd = {
  numcampo?: number,
  nomecampo: string,
  direzione: number
}

type CriterioCerca = {
  nomecampo: string,
  value: string
}

const criterioStandard: CriterioOrd = {numcampo: 0, nomecampo: "cognome", direzione: 1}
const criterioStandard2: CriterioOrd = {numcampo: 1, nomecampo: "nome", direzione: 1}

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
  const [criteriCerca, setCriteriCerca] = useState<CriterioCerca[]>([])
  const [criteriOrdina, setCriteriOrdina] = useState<CriterioOrd[]>([criterioStandard, criterioStandard2])
//  const [inputAttivo, setInputAttivo] = useState<object>({})

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error.message}</div>
  if (!data) return [] // cannot really happen
  const rows = data.rows

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
      res = confronta(criteriOrdina[i].nomecampo, row1.data[criteriOrdina[i].nomecampo] || "", row2.data[criteriOrdina[i].nomecampo] || "")
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

  function aggiornaCriteriOrdina(nomecampo: string): void {
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

  function aggiornaCriteriCerca(nomecampo: string, value: string): void {
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
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => (riga.data[a.nomecampo]||'').includes(a.value) )})
    }
    return rowsOk
  }

  const rowsToDisplay: WithId<Row>[] = TableCerca(rows)
  const rowsDisplay: WithId<Row>[] = tableOrdina(rowsToDisplay)

  return <>
    {/*<pre>{JSON.stringify(inputAttivo.id)}</pre>*/}
    <span>{rows.length} righe</span>
    {rowsDisplay.length < rows.length && <span>({rowsDisplay.length} visualizzate)</span>}
    <br />
    <span>Ordinamento per {criteriOrdina.map(a => a.direzione > 0? a.nomecampo + ":asc" + "  " : a.nomecampo + ":disc").join("  ")}</span>
    <table>
      <thead>
        <tr>
            {Object.entries(schema.fields).map(([field,type]) => 
              <th scope="col" key={field} className={`schema-${field} type-${type}`}>
              {columnTitle(field)}&nbsp;
                <CambiaOrdine
                  nomecampo={field}
                  aggiornaCriteriOrdina={aggiornaCriteriOrdina}
                />
              </th>)}
        </tr>
        <tr>
            {Object.entries(schema.fields).map(([field,type]) => <th key={"cerca"+field}>
                { !["ChoiceAnswer", "NumberAnswer", "ScoreAnswer", "Computed"].includes(type) && <InputCerca 
                  nomecampo={field} 
                  value={criteriCerca.filter(crit => crit["nomecampo"] == field).length > 0 ? criteriCerca.filter(crit => crit["nomecampo"] == field)[0].value : ""}
                  aggiornaCriteriCerca={aggiornaCriteriCerca}
                /> } 
              </th>)}
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

function InputCerca({size, value, aggiornaCriteriCerca, // setValue, 
  width, nomecampo}:{
  //type?: string, 
  size?: number, 
  value: string, 
  width?: string,
//    setValue?: (value: string) => void,
  nomecampo: string,
  aggiornaCriteriCerca: (nomecampo: string, value: string) => void
}) {

  function Battuta(e: React.ChangeEvent<HTMLInputElement>) {
    aggiornaCriteriCerca(nomecampo, e.target.value)
    //setInputAttivo(e.target)
  }

//    return <><input ref={input => input && input.focus()} type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} nomecampo={nomecampo as string} /> </>
  return <input type="text" size={value == ""? 1 : value.length + 1} value={value} onChange={Battuta} placeholder="cerca"/>
}



function CambiaOrdine({ nomecampo, aggiornaCriteriOrdina } : { 
  nomecampo: string,
  aggiornaCriteriOrdina: (nomecampo: string) => void
} ) {
return <span style={{cursor: "pointer"}} onClick={() => aggiornaCriteriOrdina(nomecampo)}>&plusmn;</span>
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