"use client"

import { useState, useEffect } from 'react'
import { Row, Sheet, useRequestScanSheetGenerationMutation } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import ArchimedeCommon from '../lib/schema/ArchimedeCommon'
import Button from './Button'
import { RowInputState } from './RowInputStateActions'
import { useDeleteRows, usePatchRow } from './TableInputRow'
import { ObjectId } from 'bson'
import { gql } from 'graphql-request'
import Error from './Error'
import useProfile from '../lib/useProfile'

const _ = gql`
    mutation requestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]) {
        requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
    }
`;

export default function Table({rows, sheet, edit, onRefresh, refreshLoading}: {
  rows: Row[],
  sheet: Sheet,
  edit?: boolean,
  onRefresh?: () => Promise<void>,
  refreshLoading?: boolean
}) {
  const profile = useProfile()
  const [rowInputState, setRowInputState] = useState<RowInputState>({
    rowIsBeingEdited: false,
    rowId: null,
    oldData: null,
    newData: null,
    focusFieldName: null,
    updatedOn: null
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showStandardAnswers, setShowStandardAnswers] = useState<boolean>(false)
  const [showAdditionalColumns, setShowAdditionalColumns] = useState<boolean>(false)
  const [showHiddenColumns, setShowHiddenColumns] = useState<boolean>(false)
  const [viewRows, setViewRows] = useState<Row[]>(rows)
  
  const [deleteRows, { loading: deleteLoading }] = useDeleteRows()
  const [patchRow, { loading: patchLoading }] = usePatchRow()

  const [requestScanSheetGeneration, { loading: scanSheetLoading, error: scanSheetError }] = useRequestScanSheetGenerationMutation({
    refetchQueries: ['ScanSheetJobs']
  })

  const schema = schemas[sheet.schema]
  const userHasSheetAdminPrivileges = profile?.isAdmin || sheet.ownerId.toString() === profile?._id?.toString() || sheet.permissions.some(p => p.role === 'admin' && (p.userId?.toString() === profile?._id?.toString() || p.email === profile?.email))

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
      <Error error={scanSheetError} />
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
        variant="danger"
        className="ml-2"
        onClick={handleDeleteSelectedRows}
        disabled={deleteLoading || selectedIds.size === 0}
      >
        {deleteLoading ? 'Eliminazione...' : 'elimina righe selezionate'}
      </Button>
      <Button 
        className="ml-2"
        onClick={handleGenerateScanSheet}
        disabled={scanSheetLoading || selectedIds.size === 0 || !userHasSheetAdminPrivileges}
      >
        genera fogli risposte
      </Button>
      {schema.fields.some(field => field.name === 'id') && (
        <Button 
          className="ml-2"
          onClick={handleGenerateStudentIds}
          disabled={!showHiddenColumns}
        >
          genera id studenti
        </Button>
      )}
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
          onRefresh={onRefresh}
          refreshLoading={refreshLoading}
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

  function handleGenerateScanSheet() {
    const selectedRowIds = viewRows
      .filter(row => selectedIds.has(row._id.toString()))
      .map(row => new ObjectId(row._id))
    requestScanSheetGeneration({
      variables: {
        sheetId: new ObjectId(sheet._id),
        selectedRowIds: selectedRowIds.length > 0 ? selectedRowIds : undefined,
      }
    })
    
    alert('Hai richiesto la generazione dei fogli risposte. Vai sulla linguetta "Scansioni" per scaricare i PDF generati.')
  }

  async function handleGenerateStudentIds() {
    // Trova il massimo valore del campo id
    const maxId = viewRows.reduce((max, row) => {
      const idValue = parseInt(row.data.id || '0', 10)
      return isNaN(idValue) ? max : Math.max(max, idValue)
    }, 0)

    // Trova le righe con id vuoto
    const rowsWithEmptyId = viewRows.filter(row => !row.data.id || row.data.id === '')
    
    if (rowsWithEmptyId.length === 0) {
      alert('Non ci sono righe con id vuoto')
      return
    }

    const confirmed = confirm(
      `Vuoi generare ${rowsWithEmptyId.length} ID studenti a partire da ${maxId + 1}?`
    )
    
    if (!confirmed) return

    // Aggiorna le righe con id vuoto
    let nextId = maxId + 1
    try {
      await Promise.all(
        rowsWithEmptyId.map(row => {
          const id = nextId++
          return patchRow({
            variables: {
              _id: new ObjectId(row._id),
              updatedOn: row.updatedOn,
              data: {
                ...row.data,
                id: id.toString()
              }
            }
          })
        })
      )
      alert(`Generati ${rowsWithEmptyId.length} ID studenti`)
    } catch (error) {
      alert(`Errore durante la generazione degli ID: ${error}`)
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