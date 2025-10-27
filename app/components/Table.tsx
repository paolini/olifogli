"use client"
import { useState } from 'react'
import { ObjectId } from 'mongodb'

import { Row, Sheet } from '@/app/graphql/generated'
import { Ordering, useCriteria, filtraEOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'

export default function Table({rows, sheet, edit}:{
  rows: Row[],
  sheet: Sheet,
  edit?: boolean
}) {
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const [ showStandardAnswers, setShowStandardAnswers ] = useState<boolean>(false)
  const [ showAdditionalColumns, setShowAdditionalColumns ] = useState<boolean>(false)
  const schema = schemas[sheet.schema]
  // Always call hooks unconditionally
  const criteria = useCriteria(schema)
  if (!schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }
  const view_rows = filtraEOrdina(criteria, rows)

  return <div className="table-container">
    <div className="table-header">
      <Ordering criteria={criteria}/>
      { ['archimede-biennio','archimede-triennio'].includes(schema.name) && (
        <>
          <br />
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
          rows={view_rows} 
          currentRowId={currentRowId} 
          setCurrentRowId={setCurrentRowId} 
          sheet={sheet} 
          schema={schema}
          showStandardAnswers={showStandardAnswers}
          showAdditionalColumns={showAdditionalColumns}
        />
      </LoadingWrapper>
    </div>
  </div>
}
