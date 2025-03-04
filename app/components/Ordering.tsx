import { useState, Dispatch, SetStateAction } from 'react'
import { WithId } from 'mongodb'
import { Row, Data } from '@/app/lib/models'

export type CriterioOrd = {
  numcampo?: number,
  nomecampo: string,
  direzione: number
}

export type CriterioCerca = {
  nomecampo: string,
  value: string
}

export type Criteria = {
    criteriCerca: CriterioCerca[],
    setCriteriCerca: Dispatch<SetStateAction<CriterioCerca[]>>,
    criteriOrdina: CriterioOrd[],
    setCriteriOrdina: Dispatch<SetStateAction<CriterioOrd[]>>
}

const criterioStandard: CriterioOrd = {numcampo: 0, nomecampo: "cognome", direzione: 1}
const criterioStandard2: CriterioOrd = {numcampo: 1, nomecampo: "nome", direzione: 1}

export function useCriteria(): Criteria {
    const [criteriCerca, setCriteriCerca] = useState<CriterioCerca[]>([])
    const [criteriOrdina, setCriteriOrdina] = useState<CriterioOrd[]>([criterioStandard, criterioStandard2])
    return { criteriCerca, setCriteriCerca, criteriOrdina, setCriteriOrdina }
}

export function Ordering({ criteria }: { criteria: Criteria }) {
    return <>
    <span>Ordinamento per {criteria.criteriOrdina.map(a => a.direzione > 0? a.nomecampo + ":asc" + "  " : a.nomecampo + ":disc").join("  ")}</span>
    </>
}

export function CambiaOrdine({ field, type, criteria } : { 
  field: string,
  type: string,
  criteria: Criteria
} ) {
    if ([ "ChoiceAnswer", "NumberAnswer", "ScoreAnswer", "Computed" ].includes(type))
        return <></>
    return <span style={{cursor: "pointer"}} onClick={() => aggiornaCriteriOrdina(criteria, field)}>&plusmn;</span>
}

export function filtraEOrdina(criteria: Criteria, rows: WithId<Row>[]): WithId<Row>[] {
    return tableOrdina(criteria.criteriOrdina, tableCerca(criteria, rows))
}

export function InputCerca({field, type, criteria, size}:{
  field: string,
  type: string,
  criteria: Criteria,
  size?: number
}) {
    if (["ChoiceAnswer", "NumberAnswer", "ScoreAnswer", "Computed"].includes(type))
        return <></>

    const value = criteria.criteriCerca.filter(crit => crit["nomecampo"] == field).length > 0 ? criteria.criteriCerca.filter(crit => crit["nomecampo"] == field)[0].value : "";

    function Battuta(e: React.ChangeEvent<HTMLInputElement>) {
        aggiornaCriteriCerca(criteria, field, e.target.value)
    }

    return <input type="text" size={value == "" ? 1 : value.length + 1} value={value} onChange={Battuta} placeholder="cerca"/>
}

function tableOrdina(criteriOrdina: CriterioOrd[], rows: WithId<Row>[]): WithId<Row>[] {
    if (criteriOrdina.length == 0) return rows
    const rowssort: WithId<Row>[] = [...rows]
    rowssort.sort((a: WithId<Row>, b: WithId<Row>) => confrontaCriteri(criteriOrdina, a, b))
    return rowssort
  }

function confrontaCriteri(criteriOrdina: CriterioOrd[], row1: WithId<Row>, row2: WithId<Row>): number {
    let i: number = 0
    let res: number = 0

    while (i < criteriOrdina.length) {
      res = confronta(criteriOrdina[i].nomecampo, row1?.data[criteriOrdina[i].nomecampo] || "", row2?.data[criteriOrdina[i].nomecampo] || "")
      if (! (res == 0)) {
        return res * criteriOrdina[i].direzione
      }
      i++
    }
    return res
  }

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

function aggiornaCriteriOrdina({criteriOrdina, setCriteriOrdina}: Criteria, nomecampo: string): void {
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

function aggiornaCriteriCerca({criteriCerca, setCriteriCerca}:Criteria, nomecampo: string, value: string): void {
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

function tableCerca({criteriCerca}:Criteria, rows: WithId<Row>[]): WithId<Row>[] {
    let rowsOk: WithId<Row>[] = [...rows]
    if (criteriCerca.length >= 0) {
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => (riga.data[a.nomecampo]||'').includes(a.value) )})
    }
    return rowsOk
}

