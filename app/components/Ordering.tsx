import { useState, Dispatch, SetStateAction, Fragment } from 'react'
import { WithId } from 'mongodb'
import { Row } from '@/app/graphql/generated'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'
import { Line } from './TableBody'

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
    return <> <span>
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
              <option value={v1}>{field.header} ↑</option>
              <option value={v2}>{field.header} ↓</option>
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
          <select key={`s-${i}`} value={criterio?.campo.name || ''} onChange={e => cambiaCriterioCerca(i, e.target.value)}>
            <option key="" value="">{criterio?"rimuovi":(i>0?"aggiungi":"scegli campo")}</option>
            { criteria.schema.fields.map(field => {
              return <option key={field.name} value={field.name}>{field.header}</option>
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
      const slice = criteria.criteriOrdina.slice(0,i)
      if (value == "") {
          criteria.setCriteriOrdina([...slice])
      } else {
          criteria.setCriteriOrdina([...slice, stringToCriterio(value)])
      }
    }

    function cambiaCriterioCerca(i: number, value: string) {
      const slice = criteria.criteriCerca.slice(0,i)
      if (value == "") {
          criteria.setCriteriCerca([...slice])
      } else {
          const field = name_to_field_dict[value]
          criteria.setCriteriCerca([...slice, {campo:field, value:""}])
      }
    }
}

export function filtraEOrdina(criteria: Criteria, rows: Line[]): Line[] {
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

export function tableOrdina(criteriOrdina: CriterioOrd[], rows: Line[]): Line[] {
    const rowssort: Line[] = [...rows]
    rowssort.sort((a: Line, b: Line) => confrontaCriteri(criteriOrdina, a, b))
    return rowssort
  }

function confrontaCriteri(criteriOrdina: CriterioOrd[], row1: Line, row2: Line): number {
    let res: number = 0

    for (let i=0; i < criteriOrdina.length; i++) {
      res = criteriOrdina[i].campo.compare(row1?.data[criteriOrdina[i].campo.name] || "", row2?.data[criteriOrdina[i].campo.name] || "")
      if (res !== 0) {
        return res * criteriOrdina[i].direzione
      }
    }
    // Ordinamento finale per createdOn (se presente e valido)
    if (row1.createdOn && row2.createdOn) {
      const t1 = new Date(row1.createdOn).getTime()
      const t2 = new Date(row2.createdOn).getTime()
      if (!isNaN(t1) && !isNaN(t2)) {
        res = t1 - t2
        return res
      }
    }
    return 0
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

function tableCerca({criteriCerca}:Criteria, rows: Line[]): Line[] {
    let rowsOk: Line[] = [...rows]
    if (criteriCerca.length >= 0) {
      criteriCerca.forEach((a) => {rowsOk = rowsOk.filter(riga => (riga.data[a.campo.name]||'').includes(a.value) )})
    }
    return rowsOk
}

