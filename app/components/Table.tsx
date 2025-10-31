"use client"

import { useState, useEffect, SetStateAction, Dispatch } from 'react'
import { Row, Sheet } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import ArchimedeCommon from '../lib/schema/ArchimedeCommon'
import Button from './Button'
import { RowInputState } from './RowInputStateActions'
import { useDeleteRows } from './TableInputRow'
import { ObjectId } from 'bson'


export default function Table({rows, sheet, edit, selectedIds, setSelectedIds}: {
  rows: Row[],
  sheet: Sheet,
  edit?: boolean,
  selectedIds: Set<string>,
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
}) {
  const [rowInputState, setRowInputState] = useState<RowInputState>({
    rowIsBeingEdited: false,
    rowId: null,
    oldData: null,
    newData: null,
    focusFieldName: null,
    updatedOn: null
  })
  const [showStandardAnswers, setShowStandardAnswers] = useState<boolean>(false)
  const [showAdditionalColumns, setShowAdditionalColumns] = useState<boolean>(false)
  const [showHiddenColumns, setShowHiddenColumns] = useState<boolean>(false)
  const [viewRows, setViewRows] = useState<Row[]>(rows)
  
  const [deleteRows, { loading: deleteLoading }] = useDeleteRows()

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
        ...replacedRows,
        ...Object.values(map_id_to_incoming_row).sort().map(obj => obj.row)
      ]
    })
  }, [rows])

  if (!schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }

  return <div className="table-container">
    <div className="table-header">
      {(schema instanceof ArchimedeCommon) &&
        <label>
          <input type="checkbox" checked={showStandardAnswers} onChange={e => setShowStandardAnswers(e.target.checked)} />
          {' '}Mostra risposte standard
        </label>
      }
      <label className="ml-4">
        <input type="checkbox" checked={showAdditionalColumns} onChange={e => setShowAdditionalColumns(e.target.checked)} />
        {' '}Mostra colonne informative
      </label>
      <label className="ml-4">
        <input type="checkbox" checked={showHiddenColumns} onChange={e => setShowHiddenColumns(e.target.checked)} />
        {' '}Mostra colonne nascoste
      </label>
      <span className="ml-4">
        {selectedIds.size} {`${selectedIds.size===1 ? 'riga selezionata' : 'righe selezionate'}`}
      </span>
      <Button 
        className="ml-2"
        onClick={handleDeleteSelectedRows}
        disabled={deleteLoading || selectedIds.size === 0}
      >
        {deleteLoading ? 'Eliminazione...' : 'elimina righe selezionate'}
      </Button>
    </div>
    <div className="table-scroll-container">
      <LoadingWrapper>
        <TableInner 
          rows={viewRows}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          rowInputState={rowInputState}
          setRowInputState={setRowInputState}
          sheet={sheet}
          schema={schema}
          showStandardAnswers={showStandardAnswers}
          showAdditionalColumns={showAdditionalColumns}
          showHiddenColumns={showHiddenColumns}
          edit={edit}
          setSort={setSort}
        />
      </LoadingWrapper>
    </div>
  </div>

  async function handleDeleteSelectedRows() {
    if (selectedIds.size === 0) return
    
    const confirmed = confirm(
      `Sei sicuro di voler eliminare ${selectedIds.size} ${selectedIds.size === 1 ? 'riga' : 'righe'}?`
    )
    
    if (!confirmed) return
    
    try {
      const ids = Array.from(selectedIds).map(id => new ObjectId(id))
      await deleteRows({ variables: { ids } })
      setSelectedIds(new Set()) // Deseleziona tutte le righe dopo l'eliminazione
    } catch (error) {
      alert(`Errore durante l'eliminazione: ${error}`)
    }
  }

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