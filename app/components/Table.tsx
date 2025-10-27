"use client"
import { useState, useEffect } from 'react'
import { ObjectId } from 'mongodb'

import { Row, Sheet } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'

export default function Table({rows, sheet, edit}:{
  rows: Row[],
  sheet: Sheet,
  edit?: boolean
}) {
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const [ showStandardAnswers, setShowStandardAnswers ] = useState<boolean>(false)
  const [ showAdditionalColumns, setShowAdditionalColumns ] = useState<boolean>(false)
  const [ viewRows, setViewRows ] = useState<Row[]>(rows)
  const schema = schemas[sheet.schema]

  useEffect(() => {
    setViewRows(prevViewRows => {
      const map_id_to_incoming_row = Object.fromEntries(rows.map((row,i) => [row._id.toString(), {row,i}])) 
      const replacedRows: Row[] = prevViewRows.map(r => {
        const row = map_id_to_incoming_row[r._id.toString()]?.row
        if (row === undefined) return undefined
        delete map_id_to_incoming_row[r._id.toString()]
        return row
      }).filter(r => r!==undefined)

      return [
        // Mantieni solo le righe che sono ancora presenti
        ...replacedRows,
        // Aggiungi le nuove righe
        ...Object.values(map_id_to_incoming_row).sort().map(obj => obj.row)
      ]
    })
  }, [rows])

  if (!schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }

  return <div className="table-container">
    <div className="table-header">
      { ['archimede-biennio','archimede-triennio'].includes(schema.name) && (
        <>
          <label>
            <input type="checkbox" checked={showStandardAnswers} onChange={e => setShowStandardAnswers(e.target.checked)} />
            {' '}Mostra risposte standard
          </label>
          <label className="ml-4">
            <input type="checkbox" checked={showAdditionalColumns} onChange={e => setShowAdditionalColumns(e.target.checked)} />
            {' '}Mostra colonne informative
          </label>
        </>
      )}
    </div>
    <div className="table-scroll-container">
      <LoadingWrapper>
        <TableInner 
          rows={viewRows} 
          currentRowId={currentRowId} 
          setCurrentRowId={setCurrentRowId} 
          sheet={sheet} 
          schema={schema}
          showStandardAnswers={showStandardAnswers}
          showAdditionalColumns={showAdditionalColumns}
          edit={edit}
          setSort={setSort}
        />
      </LoadingWrapper>
    </div>
  </div>

  function setSort(field: Field|string, direction: number) {
    if (field instanceof Field) {
      const sort_criteria = [{ campo: field, direzione: direction }]
      setViewRows(viewRows => tableOrdina(sort_criteria, viewRows))
    } else {
      setViewRows(viewRows => [...viewRows].sort((a,b) => {
        const aValue = a[field as keyof Row];
        const bValue = b[field as keyof Row];
        if (aValue < bValue) return -direction;
        if (aValue > bValue) return direction;
        return 0;
      }))
    }
  }
}