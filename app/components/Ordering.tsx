import { Field } from '@/app/lib/schema/fields'
import { Line } from './Table'

type CriterioOrd = {
  campo: Field
  direzione: number
}

export function tableOrdina(criteriOrdina: CriterioOrd[], rows: Line[]): Line[] {
    const rowssort: Line[] = [...rows]
    rowssort.sort((a: Line, b: Line) => confrontaCriteri(criteriOrdina, a, b))
    return rowssort
  }

function confrontaCriteri(criteriOrdina: CriterioOrd[], line1: Line, line2: Line): number {
    let res: number = 0

    for (let i=0; i < criteriOrdina.length; i++) {
      res = criteriOrdina[i].campo.compare(line1.row?.data[criteriOrdina[i].campo.name] || "", line2.row?.data[criteriOrdina[i].campo.name] || "")
      if (res !== 0) {
        return res * criteriOrdina[i].direzione
      }
    }
    // Ordinamento finale per createdOn (se presente e valido)
    if (line1.row?.createdOn && line2.row?.createdOn) {
      const t1 = new Date(line1.row.createdOn).getTime()
      const t2 = new Date(line2.row.createdOn).getTime()
      if (!isNaN(t1) && !isNaN(t2)) {
        res = t1 - t2
        return res
      }
    }
    return 0
  }


