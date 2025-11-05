"use client"

import { useState, useEffect, SetStateAction, Dispatch } from 'react'
import { Row, Sheet, useRequestScanSheetGenerationMutation, useOlimanagerCreateParticipantMutation } from '@/app/graphql/generated'
import { tableOrdina } from '@/app/components/Ordering'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'
import { schemas } from '../lib/schema'
import ErrorElement from './Error'
import { Field } from '../lib/schema/fields'
import ArchimedeCommon from '../lib/schema/ArchimedeCommon'
import { RowInputState } from './RowInputStateActions'
import { useDeleteRows, usePatchRow } from './TableInputRow'
import { ObjectId } from 'bson'
import { gql } from 'graphql-request'
import Error from './Error'
import useProfile from '../lib/useProfile'
import Loading from './Loading'
import Schema from '../lib/schema/Schema'

const _ = gql`
    mutation requestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]) {
        requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
    }
`;

const __ = gql`
  mutation OlimanagerCreateParticipant($rowIds: [ObjectId!]!, $username: String, $password: String!) {
    olimanagerCreateParticipant(rowIds: $rowIds, username: $username, password: $password)
  }
`;

export default function Table({rows, sheet, edit, onRefresh, refreshLoading}: {
  rows: Row[],
  sheet: Sheet,
  edit?: boolean,
  onRefresh?: () => Promise<void>,
  refreshLoading?: boolean
}) {
  const [rowInputState, setRowInputState] = useState<RowInputState>({
    rowIsBeingEdited: false,
    rowId: null,
    oldData: null,
    newData: null,
    focusFieldName: null,
    updatedOn: null
  })
  const [viewRows, setViewRows] = useState<Row[]>(rows)

  // aggrega tutto lo stato che può essere utilizzato
  // dal menu a tendina delle azioni
  const ctx = useTableContext(rows, sheet, onRefresh)

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

  if (!ctx.schema) {
    return <ErrorElement error={`Schema <${sheet.schema}> non trovato`}></ErrorElement>
  }

  return <div className="table-container">
    <div className="table-header">
      <Error error={ctx.scanSheetError} />
      <Error error={ctx.olimanagerError} />
      <Checkboxes ctx={ctx} />
      <ActionSelector ctx={ctx}/>
    </div>

    <div className="table-scroll-container">
      <LoadingWrapper>
        <TableInner
          ctx={ctx}
          rowInputState={rowInputState}
          setRowInputState={setRowInputState}
          edit={edit}
          setSort={setSort}
          refreshLoading={refreshLoading}
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

export type TableContext = {
  profile: ReturnType<typeof useProfile>,
  rows: Row[],
  sheet: Sheet,
  schema: Schema,
  onRefresh?: () => Promise<void>,
  selectedIds: Set<string>,
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>,
  showStandardAnswers: boolean,
  setShowStandardAnswers: (show: boolean) => void,
  showAdditionalColumns: boolean,
  setShowAdditionalColumns: (show: boolean) => void,
  showHiddenColumns: boolean,
  setShowHiddenColumns: (show: boolean) => void,
  deleteRows: (args: { variables: { ids: ObjectId[] } }) => Promise<unknown>,
  deleteLoading: boolean,
  patchRow: (args: { variables: { _id: ObjectId, updatedOn: Date, data: Record<string, unknown> } }) => Promise<unknown>,
  patchLoading: boolean,
  requestScanSheetGeneration: (args: { variables: { sheetId: ObjectId, selectedRowIds?: ObjectId[] } }) => Promise<unknown>,
  scanSheetLoading: boolean,
  scanSheetError: Error | undefined,
  olimanagerCreateParticipant: (args: { variables: { rowIds: ObjectId[], username: string, password: string } }) => Promise<unknown>,
  olimanagerLoading: boolean,
  olimanagerError: Error | undefined,
  userHasSheetAdminPrivileges: boolean
}

function useTableContext(rows: Row[], sheet: Sheet, onRefresh: (() => Promise<void>)|undefined): TableContext {
  const profile = useProfile()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showStandardAnswers, setShowStandardAnswers] = useState<boolean>(false)
  const [showAdditionalColumns, setShowAdditionalColumns] = useState<boolean>(false)
  const [showHiddenColumns, setShowHiddenColumns] = useState<boolean>(false)
  
  const [deleteRows, { loading: deleteLoading }] = useDeleteRows()
  const [patchRow, { loading: patchLoading }] = usePatchRow()

  const [requestScanSheetGeneration, { loading: scanSheetLoading, error: scanSheetError }] = useRequestScanSheetGenerationMutation({
    refetchQueries: ['ScanSheetJobs']
  })
  const [olimanagerCreateParticipant, { loading: olimanagerLoading, error: olimanagerError }] = useOlimanagerCreateParticipantMutation()

  const userHasSheetAdminPrivileges = profile?.isAdmin || sheet.ownerId.toString() === profile?._id?.toString() || sheet.permissions.some(p => p.role === 'admin' && (p.userId?.toString() === profile?._id?.toString() || p.email === profile?.email))
  const schema = schemas[sheet.schema]

  return {
    rows,
    sheet,
    onRefresh,
    profile,
    schema,
    selectedIds,
    setSelectedIds,
    showStandardAnswers,
    setShowStandardAnswers,
    showAdditionalColumns,
    setShowAdditionalColumns,
    showHiddenColumns,
    setShowHiddenColumns,
    deleteRows,
    deleteLoading,
    patchRow,
    patchLoading,
    requestScanSheetGeneration,
    scanSheetLoading,
    scanSheetError,
    olimanagerCreateParticipant,
    olimanagerLoading,
    olimanagerError,
    userHasSheetAdminPrivileges
  }
}

function Checkboxes({ctx}: {ctx: TableContext}) {
  return <>
        {(ctx.schema instanceof ArchimedeCommon) &&
        <label>
          <input type="checkbox" checked={ctx.showStandardAnswers} onChange={e => ctx.setShowStandardAnswers(e.target.checked)} />
          {' '}Mostra risposte standard
        </label>
      }
      <label className="ml-4">
        <input type="checkbox" checked={ctx.showAdditionalColumns} onChange={e => ctx.setShowAdditionalColumns(e.target.checked)} />
        {' '}Mostra colonne informative
      </label>
      <label className="ml-4">
        <input type="checkbox" checked={ctx.showHiddenColumns} onChange={e => ctx.setShowHiddenColumns(e.target.checked)} />
        {' '}Mostra colonne nascoste
      </label>
  </>
}

function ActionSelector({ctx}: {ctx: TableContext}) {
  return <>
        { (ctx.deleteLoading || ctx.scanSheetLoading || ctx.olimanagerLoading || ctx.patchLoading)
      ? <Loading />
      : <select
        className="ml-2 border rounded px-2 py-1"
        onChange={(e) => actions[e.target.value].handler(ctx)}
        value="none"
      >
        <option value="none" disabled>
          {ctx.selectedIds.size} {`${ctx.selectedIds.size===1 ? 'riga selezionata' : 'righe selezionate'}`}
        </option>
        {Object.entries(actions).map(([key, action]) => {
          if (action.hidden(ctx)) return null
          return <option 
            key={key} 
            value={key} 
            disabled={action.disabled(ctx)}
          >
            {action.label}
          </option>
        })}
      </select>}
  </>
}

type Action = {
  label: string,
  hidden: (ctx: TableContext) => boolean,
  disabled: (ctx: TableContext) => boolean,
  handler: (ctx: TableContext) => Promise<void> | void
}

const actions: Record<string, Action> = {
  'delete': {
    label: 'Elimina righe selezionate',
    hidden: ctx => false,
    disabled: ctx => ctx.selectedIds.size === 0,
    handler: handleDeleteSelectedRows
  },
  'scan': {
    label: 'Genera fogli risposte',
    hidden: ctx => false,
    disabled: ctx => ctx.selectedIds.size === 0 || !ctx.userHasSheetAdminPrivileges,
    handler: handleGenerateScanSheet
  },
  'olimanager': {
    hidden: ctx => !ctx.profile?.isAdmin,
    label: 'Crea/abbina partecipanti (Olimanager)',
    disabled: ctx => ctx.selectedIds.size === 0,
    handler: handleOlimanagerCreateParticipants
  },
  'gen_ids': {
    label: 'Genera ID studenti',
    hidden: ctx => !ctx.schema.fields.some(field => field.name === 'id'),
    disabled: ctx => !ctx.showHiddenColumns,
    handler: handleGenerateStudentIds
  }
}

async function handleDeleteSelectedRows(ctx: TableContext) {
  if (ctx.selectedIds.size === 0) return

  const confirmed = confirm(
    `Sei sicuro di voler eliminare ${ctx.selectedIds.size} ${ctx.selectedIds.size === 1 ? 'riga' : 'righe'}?`
  )
  
  if (!confirmed) return
  
  try {
    const ids = Array.from(ctx.selectedIds).map(id => new ObjectId(id))
    await ctx.deleteRows({ variables: { ids } })
    ctx.setSelectedIds(new Set()) // Deseleziona tutte le righe dopo l'eliminazione
  } catch (error) {
    alert(`Errore durante l'eliminazione: ${error}`)
  }
}

function handleGenerateScanSheet(ctx: TableContext) {
  const selectedRowIds = ctx.rows
    .filter(row => ctx.selectedIds.has(row._id.toString()))
    .map(row => new ObjectId(row._id))
  ctx.requestScanSheetGeneration({
    variables: {
      sheetId: new ObjectId(ctx.sheet._id),
      selectedRowIds: selectedRowIds.length > 0 ? selectedRowIds : undefined,
    }
  })
  
  alert('Hai richiesto la generazione dei fogli risposte. Vai sulla linguetta "Scansioni" per scaricare i PDF generati.')
}

async function handleGenerateStudentIds(ctx: TableContext) {
  // Trova il massimo valore del campo id
  const maxId = ctx.rows.reduce((max, row) => {
    const idValue = parseInt(row.data.id || '0', 10)
    return isNaN(idValue) ? max : Math.max(max, idValue)
  }, 0)

  // Trova le righe con id vuoto
  const rowsWithEmptyId = ctx.rows.filter(row => !row.data.id || row.data.id === '')
  
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
        return ctx.patchRow({
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

async function handleOlimanagerCreateParticipants(ctx: TableContext) {
  if (ctx.selectedIds.size === 0) return
  const ids = Array.from(ctx.selectedIds).map(id => new ObjectId(id))
  const confirmed = confirm(`Inviare ${ids.length} righe a Olimanager per creazione/abbinamento partecipanti?`)
  if (!confirmed) return
  const username = prompt('Username olimanager (email)') ?? ''
  const password = prompt('Password') ?? ''
  const res = await ctx.olimanagerCreateParticipant({ variables: { rowIds: ids, username, password } }) as {data?: {olimanagerCreateParticipant?: boolean[]}}
  const arr = res.data?.olimanagerCreateParticipant || []
  const ok = arr.filter(Boolean).length
  const ko = arr.length - ok
  alert(`Esito Olimanager: ${ok} ok, ${ko} errori`)
  if (ctx.onRefresh) await ctx.onRefresh()
}

