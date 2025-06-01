import { useState, Dispatch, SetStateAction, Fragment } from 'react'
import { WithId } from 'mongodb'
import { Row } from '@/app/lib/models'
import { Schema } from '@/app/lib/schema'
import { Field } from '@/app/lib/fields'

export type CriterioOrd = {
  campo: Field
  direzione: number
}

export type CriterioCerca = {
  campo: Field
  value: string
}

export type Criteria = {
    criteriCerca: CriterioCerca[],
    setCriteriCerca: Dispatch<SetStateAction<CriterioCerca[]>>,
    criteriOrdina: CriterioOrd[],
    setCriteriOrdina: Dispatch<SetStateAction<CriterioOrd[]>>
    schema: Schema
}

export function useCriteria(schema: Schema): Criteria {
    const [criteriCerca, setCriteriCerca] = useState<CriterioCerca[]>([])
    const [criteriOrdina, setCriteriOrdina] = useState<CriterioOrd[]>([])
    return { criteriCerca, setCriteriCerca, criteriOrdina, setCriteriOrdina, schema }
}

export function Ordering({ criteria }: { criteria: Criteria }) {
    const name_to_field_dict = Object.fromEntries(criteria.schema.fields.map(field => [field.name, field]))
    return <><span>
      Ordinamento per {[...criteria.criteriOrdina,null].map((criterio,i) => <span key={`c-${i}`}>
        {i>0 && <span key={`s-${i}`}> + </span>}
        <select 
          key={i} 
          value={criterio?criterioToString(criterio):""}
          onChange={e => cambiaCriterioOrdinamento(i, e.target.value)}>
          { criterio
            ? <option key="" value="">rimuovi criterio</option>
            : <option key="" value="">aggiungi criterio</option>}
          { criteria.schema.fields.map(field => {
            const c1 = {campo:field,direzione:1}
            const c2 = {campo:field,direzione:-1}
            const v1 = criterioToString(c1)
            const v2 = criterioToString(c2)
            return <Fragment key={field.name}>
              <option value={v1}>{v1}</option>
              <option value={v2}>{v2}</option>
            </Fragment>
          }
          )}
        </select>
      </span>)}
    </span><br />
    <span>
      Filtra per {[...criteria.criteriCerca,null].map((criterio,i) => {
        return <Fragment key={`f-${i}`}>
        {i>0 && <span> + </span>}
          <select key={`s-${i}`} value={criterio?.campo.header || ''} onChange={e => cambiaCriterioCerca(i, e.target.value)}>
            <option key="" value="">{criterio?"rimuovi":(i>0?"aggiungi":"scegli campo")}</option>
            { Object.entries(criteria.schema.fields).map(([field,type]) => {
              return <option key={field} value={field}>{field}</option>
            })}
          </select>
          {criterio && <InputCerca key={`i-${i}`} field={criterio.campo} type={criterio.campo.name} criteria={criteria} />}
        </Fragment>
      })}
    </span>
    </>

    function criterioToString(criterio: CriterioOrd): string {
        return criterio.direzione > 0 ? criterio.campo.name + " ↑" : criterio.campo.name + " ↓"
    }

    function stringToCriterio(value: string): CriterioOrd {
      const [nomecampo, direzione] = value.split(" ")
      const field = name_to_field_dict[nomecampo]
      return {campo: field, direzione: direzione == "↑" ? 1 : -1}
    }

    function cambiaCriterioOrdinamento(i: number, value: string) {
        if (value == "") {
          criteria.setCriteriOrdina(criteria.criteriOrdina.slice(0,i))
        } else {
          criteria.setCriteriOrdina([...criteria.criteriOrdina.slice(0,i), stringToCriterio(value)])
        }
    }

    function cambiaCriterioCerca(i: number, value: string) {
        if (value == "") {
          criteria.setCriteriCerca(criteria.criteriCerca.slice(0,i))
        } else {
          const field = name_to_field_dict[value]
          criteria.setCriteriCerca([...criteria.criteriCerca.slice(0,i), {campo:field, value:""}])
        }
    }
}

function CambiaOrdine({ field, type, criteria } : { 
  field: Field,
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
  field: Field,
  type: string,
  criteria: Criteria,
  size?: number
}) {
    if (["ChoiceAnswer", "NumberAnswer", "ScoreAnswer", "Computed"].includes(type))
        return <></>

    const value = criteria.criteriCerca.filter(crit => crit.campo == field).length > 0 ? criteria.criteriCerca.filter(crit => crit.campo == field)[0].value : "";

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
      res = confronta(criteriOrdina[i].campo, row1?.data[criteriOrdina[i].campo.name] || "", row2?.data[criteriOrdina[i].campo.name] || "")
      if (! (res == 0)) {
        return res * criteriOrdina[i].direzione
      }
      i++
    }
    return res
  }

function confronta(campo: Field, camporow1: string, camporow2: string): number {
  const campiNumero: string[] = ["classe", "codice", "punteggio"]
  const campiData: string[] = ["data_nascita"]

  if (campiNumero.includes(campo.name)) {
    return (
      (parseFloat(camporow1) - parseFloat(camporow2) > 0)? 1 :
        (parseFloat(camporow1) - parseFloat(camporow2) < 0)? -1 : 0
    )
  }
  if (campiData.includes(campo.name)) {
    return (
      (Date.parse(camporow1) > Date.parse(camporow2))? 1 :
        (Date.parse(camporow1) < Date.parse(camporow2))? -1 : 0
    )
  }
  return (
      (camporow1.toUpperCase() > camporow2.toUpperCase())? 1 :
        (camporow1.toUpperCase() < camporow2.toUpperCase())?  -1 : 0
    )
}

function aggiornaCriteriOrdina({criteriOrdina, setCriteriOrdina}: Criteria, campo: Field): void {
    let i: number
    let cera: boolean = false
    const critOrdina: CriterioOrd[] = [...criteriOrdina]

    for (i = 0; i < critOrdina.length; i++) {
      if (critOrdina[i].campo == campo) {
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
      setCriteriOrdina([...critOrdina, {campo: campo, direzione: 1}])
    }
  }

function aggiornaCriteriCerca({criteriCerca, setCriteriCerca}:Criteria, campo: Field, value: string): void {
    let i: number
    let cera: boolean = false
    const critCerca: CriterioCerca[] = [...criteriCerca]
    for (i = 0; i < critCerca.length; i++) {
      if (critCerca[i].campo == campo) {
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
      setCriteriCerca([...critCerca, {campo: campo, value: value}])
    }
  }

function tableCerca({criteriCerca}:Criteria, rows: WithId<Row>[]): WithId<Row>[] {
    let rowsOk: WithId<Row>[] = [...rows]
    if (criteriCerca.length >= 0) {
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => (riga.data[a.campo.name]||'').includes(a.value) )})
    }
    return rowsOk
}

