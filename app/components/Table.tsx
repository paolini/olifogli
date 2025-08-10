"use client"
import { useState } from 'react'
import { WithId, ObjectId } from 'mongodb'

import { Row, Sheet } from '@/app/lib/models'
import { Ordering, useCriteria, filtraEOrdina } from '@/app/components/Ordering'
import ReadOnlyTable from './ReadOnlyTable'
import RowForm from './RowForm'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'

export default function Table({rows, sheet}:{
  rows: Row[],
  sheet: Sheet, 
}) {
  const [selectedRow, setSelectedRow] = useState<WithId<Row> | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const schema = schemas[sheet.schema]
  
  // Always call hooks unconditionally
  const criteria = useCriteria(schema)
  
  if (!schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }
  
  const view_rows = filtraEOrdina(criteria, rows)

  const handleRowClick = (row: WithId<Row>) => {
    setSelectedRow(row)
    setShowNewForm(false)
  }

  const handleNewRow = () => {
    setSelectedRow(null)
    setShowNewForm(true)
  }

  const handleCancel = () => {
    setSelectedRow(null)
    setShowNewForm(false)
  }

  return (
    <div className="table-container">
      {/* Header con informazioni e controlli */}
      <div className="table-header">
        <div className="table-info">
          <span>{rows.length} righe</span>
          {view_rows.length < rows.length && <span> ({view_rows.length} visualizzate)</span>}
        </div>
        
        <div className="table-controls">
          <button 
            onClick={handleNewRow}
            className="new-row-button"
            disabled={showNewForm}
          >
            Nuova Riga
          </button>
        </div>
      </div>

      <Ordering criteria={criteria}/>

      {/* Form per modificare/creare righe */}
      {(selectedRow || showNewForm) && (
        <RowForm
          sheet={sheet}
          schema={schema}
          row={selectedRow || undefined}
          onCancel={handleCancel}
        />
      )}

      {/* Tabella di sola lettura */}
      <LoadingWrapper>
        <ReadOnlyTable 
          rows={view_rows} 
          onRowClick={handleRowClick}
          selectedRowId={selectedRow?._id || null}
          schema={schema}
        />
      </LoadingWrapper>
    </div>
  )
}
