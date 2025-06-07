"use client"
import { useState } from 'react'
import { ObjectId } from 'mongodb'

import { Row, Sheet } from '@/app/lib/models'
import { Ordering, useCriteria, filtraEOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'

export default function Table({rows, sheet}:{
  rows: Row[],
  sheet: Sheet, 
}) {
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const schema = schemas[sheet.schema]
  if (!schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }
  const criteria = useCriteria(schema)  
  const view_rows = filtraEOrdina(criteria, rows)

  return <>
    <span>{rows.length} righe</span>
    {view_rows.length < rows.length && <span> ({view_rows.length} visualizzate)</span>}
    <br />
    <Ordering criteria={criteria}/>
      <LoadingWrapper>
        <TableInner 
          rows={view_rows} 
          currentRowId={currentRowId} 
          setCurrentRowId={setCurrentRowId} 
          sheet={sheet} 
          schema={schema}
        />
      </LoadingWrapper>
  </>
}
