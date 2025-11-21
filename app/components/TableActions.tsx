import { ObjectId } from "bson"
import { Row, Sheet, useDeleteRowsMutation, useOlimanagerBulkUpdateResultsMutation, useOlimanagerCreateParticipantMutation, usePatchRowMutation, useRequestScanSheetGenerationMutation } from "../graphql/generated"
import Schema from "../lib/schema/Schema"
import Checkboxes, { CheckboxesState } from "./TableCheckboxes"
import { TableState } from "./Table"
import { Dispatch, SetStateAction, useState } from "react"
import { ApolloError } from "@apollo/client"
import Error from "./Error"
import { pluralize } from "../lib/util"
import Button from "./Button"

type TableActionInput = {
  profile?: { isAdmin: boolean, email: string},
  sheet: Sheet,
  edit: boolean,
  refresh?: () => Promise<void>,
  schema: Schema,
  checkboxesState: CheckboxesState, setCheckboxesState: Dispatch<SetStateAction<CheckboxesState>>,
  userHasSheetAdminPrivileges: boolean,
  tableState: TableState,
  setTableState: Dispatch<SetStateAction<TableState>>,
  csvDownload: (rows?: Row[]) => void,
  setCsvImport: Dispatch<SetStateAction<boolean>>,
}

export default function TableActions(input: TableActionInput) {
    const ctx = useTableActionsContext(input)

    return <>
        <TableActionsErrors ctx={ctx} />
        <Checkboxes schema={ctx.schema} state={ctx.checkboxesState} setState={ctx.setCheckboxesState} />
        <select
            className="ml-2 border rounded px-2 py-1"
            onChange={(e) => actions[e.target.value].handler(ctx)}
            value="none"
        >
            <option value="none" disabled>
            {pluralize(ctx.tableState.selectedLineKeys.size, 'riga selezionata', 'righe selezionate')}
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
      </select>
      {ctx.edit && <Button onClick={() => ctx.setCsvImport(true)} className="ml-4 px-4">
        Importa CSV
      </Button>}
      {ctx.csvDownload && <Button onClick={() => ctx.csvDownload()} className="ml-4 px-4">
        Scarica CSV
      </Button>}
    </>
}

export function TableActionsErrors({ctx}: {ctx: TableActionContext}) {
    return ctx.mutations.errors.map((error,i) => <Error key={i} error={error} />)
}

type TableActionContext = TableActionInput & {
  mutations: {
    deleteRows: (args: { variables: { ids: ObjectId[] } }) => Promise<unknown>,
    patchRow: (args: { variables: { _id: ObjectId, updatedOn: Date, data: Record<string, unknown> } }) => Promise<unknown>,
    requestScanSheetGeneration: (args: { variables: { sheetId: ObjectId, selectedRowIds?: ObjectId[] } }) => Promise<unknown>,
    olimanagerCreateParticipant: (args: { variables: { rowIds: ObjectId[], username: string, password: string } }) => Promise<unknown>,
    olimanagerBulkUpdateResults: (args: { variables: { rowIds: ObjectId[], username: string, password: string } }) => Promise<unknown>,
    loading: boolean,
    errors: ApolloError[],
  }
  olimanagerEmail: string,
  setOlimanagerEmail: Dispatch<SetStateAction<string>>,
  olimanagerPassword: string,
  setOlimanagerPassword: Dispatch<SetStateAction<string>>,
}

export function useTableActionsContext({profile, sheet, refresh, schema, checkboxesState, setCheckboxesState, userHasSheetAdminPrivileges, tableState, setTableState, csvDownload, setCsvImport, edit}: TableActionInput): TableActionContext {
  const [deleteRows, { loading: deleteLoading }] = useDeleteRowsMutation()
  const [patchRow, { loading: patchLoading }] = usePatchRowMutation()

  const [requestScanSheetGeneration, { loading: scanSheetLoading, error: scanSheetError }] = useRequestScanSheetGenerationMutation({
    refetchQueries: ['ScanSheetJobs']
  })
  const [olimanagerCreateParticipant, { loading: olimanagerCreateParticipantLoading, error: olimanagerCreateParticipantError }] = useOlimanagerCreateParticipantMutation()
  const [olimanagerBulkUpdateResults, { loading: olimanagerBulkUpdateLoading, error: olimanagerBulkUpdateError }] = useOlimanagerBulkUpdateResultsMutation()
  const [olimanagerEmail, setOlimanagerEmail] = useState<string>(profile?.email || '')
  const [olimanagerPassword, setOlimanagerPassword] = useState<string>('')

  return {
      profile, sheet, refresh, schema, 
      checkboxesState, setCheckboxesState, userHasSheetAdminPrivileges, 
      tableState, setTableState,
      mutations: {
            deleteRows,
            patchRow,
            requestScanSheetGeneration,
            olimanagerCreateParticipant,
            olimanagerBulkUpdateResults,
            loading: scanSheetLoading || olimanagerCreateParticipantLoading || olimanagerBulkUpdateLoading || patchLoading || deleteLoading,
            errors: [olimanagerCreateParticipantError,olimanagerBulkUpdateError,scanSheetError].filter(e => e !== undefined),
        },

        olimanagerEmail, setOlimanagerEmail,
        olimanagerPassword, setOlimanagerPassword,
        csvDownload,
        setCsvImport,
        edit,
    }
}

type Action = {
  label: string,
  hidden: (ctx: TableActionContext) => boolean,
  disabled: (ctx: TableActionContext) => boolean,
  handler: (ctx: TableActionContext) => Promise<void> | void
}

const actions: Record<string, Action> = {
  'delete': {
    label: 'Elimina righe selezionate',
    hidden: ctx => false,
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleDeleteSelectedRows
  },
  'scan': {
    label: 'Genera fogli risposte',
    hidden: ctx => false,
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0 || !ctx.userHasSheetAdminPrivileges,
    handler: handleGenerateScanSheet
  },
  'gen_ids': {
    label: 'Genera ID studenti',
    hidden: ctx => !ctx.schema.fields.some(field => field.name === 'id'),
    disabled: ctx => !ctx.checkboxesState.showHiddenColumns,
    handler: handleGenerateStudentIds
  },
  'olimanager': {
    hidden: ctx => !ctx.profile?.isAdmin,
    label: '⚙ Crea/abbina partecipanti (Olimanager)',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleOlimanagerCreateParticipants
  },
  'update_scores': {
    hidden: ctx => !ctx.profile?.isAdmin,
    label: '⚙ Aggiorna risultati (Olimanager)',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleOlimanagerUpdateScores
  },
  'csv_download': {
    hidden: ctx => false,
    label: 'scarica CSV righe selezionate',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleCsvDownload
  }
}

async function handleDeleteSelectedRows(ctx: TableActionContext) {
  if (ctx.tableState.selectedLineKeys.size === 0) return

  const nLines = ctx.tableState.selectedLineKeys.size

  if (nLines > 1 && (!ctx.tableState.lastCsvDownload || (new Date().getTime() - ctx.tableState.lastCsvDownload.getTime()) > 60*1000)) {
    alert(`L'eliminazione delle righe è una operazione irreversibile. Prima di procedere, usa la funzione "scarica CSV" per archiviare i dati inseriti.`)
    return
  }

  const confirmed = confirm(
    `Sei sicuro di voler eliminare ${pluralize(nLines, 'riga', 'righe')}? L'operazione è irreversibile.`
  )
  
  if (!confirmed) return
  
  try {
    const selected_lines = ctx.tableState.lines.filter(line => ctx.tableState.selectedLineKeys.has(line.key))
    const ids = selected_lines
      .filter(line => line?.row?._id)
      .map(line => new ObjectId(line?.row?._id))
    const lines_without_row = selected_lines.filter(line => !line?.row?._id)
    await ctx.mutations.deleteRows({ variables: { ids } })
    if (lines_without_row.length > 0) {
        let focusLineKey = ctx.tableState.focusLineKey
        if (focusLineKey && ctx.tableState.selectedLineKeys.has(focusLineKey)) {
            focusLineKey = ''
        }
        // righe da mantenere: tutte quello con line.row (che verranno cancellate dalla mutazione)
        // e quelle che non erano state selezionate
        ctx.setTableState(prev => ({
          ...prev,
          lines: prev.lines.filter(line => line.row || !ctx.tableState.selectedLineKeys.has(line.key)),
          focusLineKey: '',
          focusColumnName: '',
        }))
    }
  } catch (error) {
    alert(`Errore durante l'eliminazione: ${error}`)
  }
}

function handleGenerateScanSheet(ctx: TableActionContext) {
  const sheetId = ctx.sheet._id
  const selectedLineKeys = ctx.tableState.selectedLineKeys
  const selectedRowIds: ObjectId[] = ctx.tableState.lines
      .filter(line => (selectedLineKeys.size === 0 || selectedLineKeys.has(line.key)) && line.row?._id)
      .map(line => line.row?._id as ObjectId)

  if (ctx?.profile?.email !== 'ginnasta@mailinator.com') {
    alert(`La generazione dei fogli risposte è temporaneamente disabilitata. Stiamo aggiornando il modello.`)
    return
  }

  if (selectedRowIds.length === 0) {
      alert('Nessuna riga valida selezionata per la generazione dei fogli risposte.')
      return
  }
  
  ctx.mutations.requestScanSheetGeneration({variables: {sheetId, selectedRowIds}})

  alert(`Hai richiesto la generazione di ${selectedRowIds.length === 1 ? 'un foglio' : `${selectedRowIds.length} fogli`} risposte. Vai sulla linguetta "Scansioni" per scaricare i PDF generati.`)
}

async function handleGenerateStudentIds(ctx: TableActionContext) {
  // Trova il massimo valore del campo id
  const maxId = ctx.tableState.lines.reduce((max, line) => {
    const idValue = parseInt(line.row?.data.id || '0', 10)
    return isNaN(idValue) ? max : Math.max(max, idValue)
  }, 0)

  // Trova le righe con id vuoto
  const rowsWithEmptyId = ctx.tableState.lines.filter(line => line.row && (!line.row?.data.id || line.row?.data.id === ''))
  
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
      rowsWithEmptyId.map(line => {
        if (!line.row) return Promise.resolve()
        const id = nextId++
        return ctx.mutations.patchRow({
          variables: {
            _id: line.row._id,
            updatedOn: line.row.updatedOn,
            data: {
              ...line.row.data,
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

function askOlimanagerCredentials(ctx: TableActionContext): {username: string, password: string} {
  const username = prompt('Username olimanager (email)', ctx.olimanagerEmail) ?? ''
  const password = prompt('Password', ctx.olimanagerPassword) ?? ''
  ctx.setOlimanagerEmail(username)
  ctx.setOlimanagerPassword(password)
  return {username, password}
}

function filterValidRowsAndConfirm(ctx: TableActionContext): Row[] | null  {
  const lines = ctx.tableState.lines
  const selectedLineKeys = ctx.tableState.selectedLineKeys
  const valid_lines = lines
    .filter(line => line?.row?._id && selectedLineKeys.has(line.key))
    .filter(line => line?.row && !line.row.error)

  if (valid_lines.length !== selectedLineKeys.size
    && !confirm(`Solo ${valid_lines.length} righe su ${selectedLineKeys.size} selezionate sono valide. Procedo con le righe valide?`)) {
      return null
    }

  return valid_lines.map(line => line.row as Row)
}

async function handleOlimanagerCreateParticipants(ctx: TableActionContext) {
  const valid_rows = filterValidRowsAndConfirm(ctx)
  if (!valid_rows || !confirm(`Inviare ${valid_rows.length} righe a Olimanager per creazione/abbinamento partecipanti?`)) {
    return
  }

  const {username, password} = askOlimanagerCredentials(ctx)
  const res = await ctx.mutations.olimanagerCreateParticipant({ variables: { rowIds: valid_rows.map(row => new ObjectId(row._id)), username, password } }) as {data?: {olimanagerCreateParticipant?: boolean[]}}
  const arr = res.data?.olimanagerCreateParticipant || []
  const ok = arr.filter(Boolean).length
  const ko = arr.length - ok
  alert(`Esito Olimanager: ${ok} ok, ${ko} errori`)
  if (ctx.refresh) await ctx.refresh()
}

async function handleOlimanagerUpdateScores(ctx: TableActionContext) {
  const valid_rows = filterValidRowsAndConfirm(ctx)
  if (!valid_rows || !confirm(`Aggiornare i risultati su Olimanager per ${valid_rows.length} righe selezionate?`)) {
    return
  }
  const ids = valid_rows.map(row => new ObjectId(row._id))
  const {username, password} = askOlimanagerCredentials(ctx)

  const res = await ctx.mutations.olimanagerBulkUpdateResults({ variables: { rowIds: ids, username, password } }) as {data?: {olimanagerBulkUpdateResults?: {success: boolean}[]}}
  alert(res.data?.olimanagerBulkUpdateResults ? 'Risultati aggiornati con successo' : 'Errore durante l\'aggiornamento dei risultati: '+JSON.stringify(res))
  
  if (ctx.refresh) await ctx.refresh()
}

async function handleCsvDownload(ctx: TableActionContext) {
  const selectedLineKeys = ctx.tableState.selectedLineKeys
  const rows = ctx.tableState.lines
    .filter(line => line.row && selectedLineKeys.has(line.key))
    .map(line => (line.row as Row))
  if (ctx.csvDownload) {
    await ctx.csvDownload(rows)
  }
}