import { ObjectId } from "bson"
import { Row, Sheet, useOlimanagerBulkUpdateResultsMutation, useOlimanagerCreateParticipantMutation, useRequestScanSheetGenerationMutation } from "../graphql/generated"
import Schema from "../lib/schema/Schema"
import { CheckboxesState } from "./TableCheckboxes"
import { RowEventuallyNew, useDeleteRows, usePatchRow } from "./TableBody"
import { Dispatch, SetStateAction, useState } from "react"
import { ApolloError } from "@apollo/client"
import Error from "./Error"

export default function TableActions({ctx}: {ctx: TableActionContext}) {
    return <>
        <select
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
      </select>
    </>
}

export function TableActionsErrors({ctx}: {ctx: TableActionContext}) {
    return ctx.mutations.errors.map((error,i) => <Error key={i} error={error} />)
}

type TableActionInput = {
  profile?: { isAdmin: boolean, email: string},
  sheet: Sheet,
  sortedRows: RowEventuallyNew[],
  refresh?: () => Promise<void>,
  selectedIds: Set<string>,
  schema: Schema,
  checkboxesState: CheckboxesState,
  userHasSheetAdminPrivileges: boolean,
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

export function useTableActionsContext({profile, sheet, sortedRows, refresh, selectedIds, schema, checkboxesState, userHasSheetAdminPrivileges}: TableActionInput): TableActionContext {
  const [deleteRows, { loading: deleteLoading }] = useDeleteRows()
  const [patchRow, { loading: patchLoading }] = usePatchRow()

  const [requestScanSheetGeneration, { loading: scanSheetLoading, error: scanSheetError }] = useRequestScanSheetGenerationMutation({
    refetchQueries: ['ScanSheetJobs']
  })
  const [olimanagerCreateParticipant, { loading: olimanagerCreateParticipantLoading, error: olimanagerCreateParticipantError }] = useOlimanagerCreateParticipantMutation()
  const [olimanagerBulkUpdateResults, { loading: olimanagerBulkUpdateLoading, error: olimanagerBulkUpdateError }] = useOlimanagerBulkUpdateResultsMutation()
  const [olimanagerEmail, setOlimanagerEmail] = useState<string>(profile?.email || '')
  const [olimanagerPassword, setOlimanagerPassword] = useState<string>('')
   
    return {profile, sheet, sortedRows, refresh, selectedIds, schema, checkboxesState, userHasSheetAdminPrivileges, 
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
        olimanagerPassword, setOlimanagerPassword
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
    disabled: ctx => ctx.selectedIds.size === 0,
    handler: handleDeleteSelectedRows
  },
  'scan': {
    label: 'Genera fogli risposte',
    hidden: ctx => false,
    disabled: ctx => ctx.selectedIds.size === 0 || !ctx.userHasSheetAdminPrivileges,
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
    label: 'Crea/abbina partecipanti (Olimanager)',
    disabled: ctx => ctx.selectedIds.size === 0,
    handler: handleOlimanagerCreateParticipants
  },
  'update_scores': {
    hidden: ctx => !ctx.profile?.isAdmin,
    label: 'Aggiorna risultati (Olimanager)',
    disabled: ctx => ctx.selectedIds.size === 0,
    handler: handleOlimanagerUpdateScores
  }
}

async function handleDeleteSelectedRows(ctx: TableActionContext) {
  if (ctx.selectedIds.size === 0) return

  const confirmed = confirm(
    `Sei sicuro di voler eliminare ${ctx.selectedIds.size} ${ctx.selectedIds.size === 1 ? 'riga' : 'righe'}?`
  )
  
  if (!confirmed) return
  
  try {
    const ids = Array.from(ctx.selectedIds).map(id => new ObjectId(id))
    await ctx.mutations.deleteRows({ variables: { ids } })
  } catch (error) {
    alert(`Errore durante l'eliminazione: ${error}`)
  }
}

function handleGenerateScanSheet(ctx: TableActionContext) {
  const selectedRowIds = ctx.sortedRows
    .filter(row => row._id && ctx.selectedIds.has(row._id.toString()))
    .map(row => new ObjectId(row._id))
  ctx.mutations.requestScanSheetGeneration({
    variables: {
      sheetId: new ObjectId(ctx.sheet._id),
      selectedRowIds: selectedRowIds.length > 0 ? selectedRowIds : undefined,
    }
  })
  
  alert('Hai richiesto la generazione dei fogli risposte. Vai sulla linguetta "Scansioni" per scaricare i PDF generati.')
}

async function handleGenerateStudentIds(ctx: TableActionContext) {
  // Trova il massimo valore del campo id
  const maxId = ctx.sortedRows.reduce((max, row) => {
    const idValue = parseInt(row.data.id || '0', 10)
    return isNaN(idValue) ? max : Math.max(max, idValue)
  }, 0)

  // Trova le righe con id vuoto
  const rowsWithEmptyId = ctx.sortedRows.filter(row => !row.data.id || row.data.id === '')
  
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
        return ctx.mutations.patchRow({
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

function askOlimanagerCredentials(ctx: TableActionContext): {username: string, password: string} {
  const username = prompt('Username olimanager (email)', ctx.olimanagerEmail) ?? ''
  const password = prompt('Password', ctx.olimanagerPassword) ?? ''
  ctx.setOlimanagerEmail(username)
  ctx.setOlimanagerPassword(password)
  return {username, password}
}

function filterValidRowsAndConfirm(ctx: TableActionContext): Row[] | null  {
  const valid_rows = ctx.sortedRows
    .filter(row => row._id && ctx.selectedIds.has(row._id.toString()))
    .filter(row => !row.error) as Row[]
  
  if (valid_rows.length !== ctx.selectedIds.size 
    && !confirm(`Solo ${valid_rows.length} righe su ${ctx.selectedIds.size} selezionate sono valide. Procedo con le righe valide?`)) {
      return null
    }

  return valid_rows
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