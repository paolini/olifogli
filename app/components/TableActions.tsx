import { ObjectId } from "bson"
import { CreateSheetsMutation, DeleteRowsMutation, PatchRowMutation, RequestScanSheetGenerationMutation, Row, Sheet, useDeleteRowsMutation, useOlimanagerBulkUpdateResultsMutation, useCreateSheetsMutation, useOlimanagerCreateParticipantMutation, usePatchRowMutation, useRequestScanSheetGenerationMutation, useOlimanagerUpdateExtraFieldsMutation, MutationCreateSheetsArgs, MutationOlimanagerCreateParticipantArgs, MutationOlimanagerBulkUpdateResultsArgs, MutationRequestScanSheetGenerationArgs, MutationPatchRowArgs, MutationDeleteRowsArgs, MutationOlimanagerUpdateExtraFieldsArgs } from "../graphql/generated"
import Schema from "../lib/schema/Schema"
import Checkboxes, { CheckboxesState } from "./TableCheckboxes"
import { TableState } from "./Table"
import { Dispatch, SetStateAction, useState } from "react"
import { ApolloError, FetchResult } from "@apollo/client"
import ErrorElement from "./Error"
import { pluralize } from "../lib/util"
import Button from "./Button"
import GlobalMessage from "./GlobalMessage"


type TableActionInput = {
  profile?: { isAdmin: boolean, email: string},
  sheet: Sheet,
  edit: boolean,
  standardAnswers: boolean,
  schema: Schema,
  checkboxesState: CheckboxesState, setCheckboxesState: Dispatch<SetStateAction<CheckboxesState>>,
  userHasSheetAdminPrivileges: boolean,
  tableState: TableState,
  setTableState: Dispatch<SetStateAction<TableState>>,
  csvDownload: (rows: Row[]) => void, // se rows non specificato, scarica tutte le righe
  setCsvImport: Dispatch<SetStateAction<boolean>>,
}

export default function TableActions(input: TableActionInput,) {
    const ctx = useTableActionsContext(input)

    return <>
        <GlobalMessage className={input.standardAnswers ? `table-message-standard` : `table-message`} title="istruzioni" name={input.standardAnswers ? `table_instructions_standard_${ctx.sheet.schema}` : `table_instructions_${ctx.sheet.schema}`} collapsed={true} />
        <TableActionsErrors ctx={ctx} />
        <Checkboxes schema={ctx.schema} state={ctx.checkboxesState} setState={ctx.setCheckboxesState} />
        <select
            className={`ml-2 border rounded px-2 py-1 ${ctx.tableState.selectedLineKeys.size > 0 ? 'bg-yellow-200' : ''}`}
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
      <Button onClick={() => handleCsvDownload()} className="ml-4 px-4">
        Scarica CSV
      </Button>
    </>

    function handleCsvDownload() {
        if (!ctx.csvDownload) throw new Error('csvDownload non definito nel contesto TableActions')
        const rows = ctx.tableState.lines
            .filter(line => line.row)
            .map(line => (line.row as Row))
          
        ctx.csvDownload(rows)
    }
}

export function TableActionsErrors({ctx}: {ctx: TableActionContext}) {
    return ctx.mutations.errors.map((error,i) => <ErrorElement key={i} error={error} />)
}

type TableActionContext = TableActionInput & {
  mutations: {
    deleteRows: (args: { variables: MutationDeleteRowsArgs }) => Promise<FetchResult<DeleteRowsMutation>>,
    patchRow: (args: { variables: MutationPatchRowArgs }) => Promise<FetchResult<PatchRowMutation>>,
    requestScanSheetGeneration: (args: { variables: MutationRequestScanSheetGenerationArgs }) => Promise<FetchResult<RequestScanSheetGenerationMutation>>,
    createSheets: (args: { variables: MutationCreateSheetsArgs }) => Promise<FetchResult<CreateSheetsMutation>>,
    olimanagerCreateParticipant: (args: { variables: MutationOlimanagerCreateParticipantArgs }) => Promise<unknown>,
    olimanagerBulkUpdateResults: (args: { variables: MutationOlimanagerBulkUpdateResultsArgs }) => Promise<unknown>,
    olimanagerUpdateExtraFields: (args: { variables: MutationOlimanagerUpdateExtraFieldsArgs }) => Promise<unknown>,
    loading: boolean,
    errors: ApolloError[],
  }
  olimanagerEmail: string,
  setOlimanagerEmail: Dispatch<SetStateAction<string>>,
  olimanagerPassword: string,
  setOlimanagerPassword: Dispatch<SetStateAction<string>>,
}

export function useTableActionsContext({profile, sheet, schema, checkboxesState, setCheckboxesState, userHasSheetAdminPrivileges, tableState, setTableState, csvDownload, setCsvImport, edit, standardAnswers}: TableActionInput): TableActionContext {
  const [deleteRows, { loading: deleteLoading }] = useDeleteRowsMutation()
  const [patchRow, { loading: patchLoading }] = usePatchRowMutation()

  const [requestScanSheetGeneration, { loading: scanSheetLoading, error: scanSheetError }] = useRequestScanSheetGenerationMutation({
    refetchQueries: ['ScanSheetJobs']
  })
  const [createSheets, { loading: createSheetsLoading, error: createSheetsError }] = useCreateSheetsMutation()
  const [olimanagerCreateParticipant, { loading: olimanagerCreateParticipantLoading, error: olimanagerCreateParticipantError }] = useOlimanagerCreateParticipantMutation()
  const [olimanagerBulkUpdateResults, { loading: olimanagerBulkUpdateLoading, error: olimanagerBulkUpdateError }] = useOlimanagerBulkUpdateResultsMutation()
  const [olimanagerUpdateExtraFields, { loading: olimanagerUpdateExtraFieldsLoading, error: olimanagerUpdateExtraFieldsError }] = useOlimanagerUpdateExtraFieldsMutation()
  const [olimanagerEmail, setOlimanagerEmail] = useState<string>(profile?.email || '')
  const [olimanagerPassword, setOlimanagerPassword] = useState<string>('')

  return {
      profile, sheet, schema, 
      checkboxesState, setCheckboxesState, userHasSheetAdminPrivileges, 
      tableState, setTableState,
      mutations: {
            deleteRows,
            patchRow,
            requestScanSheetGeneration,
            createSheets,
            olimanagerCreateParticipant,
            olimanagerBulkUpdateResults,
            olimanagerUpdateExtraFields,
            loading: scanSheetLoading || createSheetsLoading || olimanagerCreateParticipantLoading || olimanagerBulkUpdateLoading || olimanagerUpdateExtraFieldsLoading || patchLoading || deleteLoading,
            errors: [olimanagerCreateParticipantError,olimanagerBulkUpdateError,olimanagerUpdateExtraFieldsError,scanSheetError,createSheetsError].filter(e => e !== undefined),
        },

        olimanagerEmail, setOlimanagerEmail,
        olimanagerPassword, setOlimanagerPassword,
        csvDownload,
        setCsvImport,
        edit,
        standardAnswers,
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
    hidden: ctx => !ctx.edit,
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleDeleteSelectedRows
  },
  'scan': {
    label: 'Genera fogli risposte',
    hidden: ctx => !ctx.edit,
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0 || !ctx.userHasSheetAdminPrivileges,
    handler: handleGenerateScanSheet
  },
  'gen_ids': {
    label: 'Genera ID studenti',
    hidden: ctx => !ctx.edit || !ctx.schema.fields.some(field => field.name === 'id'),
    disabled: ctx => false, //ctx => !ctx.checkboxesState.showHiddenColumns,
    handler: handleGenerateStudentIds
  },
  'delete_ids':
  {
    label: 'Elimina ID studenti',
    hidden: ctx => !ctx.edit || !ctx.schema.fields.some(field => field.name === 'id'),
    disabled: ctx => false, //ctx => !ctx.checkboxesState.showHiddenColumns,
    handler: handleDeleteStudentIds,
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
  'udpate_extra_fields': {
    hidden: ctx => !ctx.profile?.isAdmin,
    label: '⚙ Aggiorna extra fields (Olimanager)',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleOlimanagerUpdateExtraFields,
  },
  'csv_download': {
    hidden: ctx => false,
    label: 'scarica CSV righe selezionate',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleCsvDownload
  },
  'anonymize': {
    hidden: ctx => !ctx.edit || !ctx.profile?.isAdmin,
    label: 'Anonimizza nomi',
    disabled: ctx => ctx.tableState.selectedLineKeys.size === 0,
    handler: handleAnonymizeNames
  },
  'create_sheets': {
    hidden: ctx => !ctx.schema.row_to_sheet,
    label: 'Genera fogli',
    disabled: ctx => !ctx.profile?.isAdmin,
    handler: handleCreateSheets
  },
}

async function handleDeleteSelectedRows(ctx: TableActionContext) {
  if (ctx.tableState.selectedLineKeys.size === 0) return

  const nLines = ctx.tableState.selectedLineKeys.size

  /* disabilitato
  if (nLines > 1 && (!ctx.tableState.lastCsvDownload || (new Date().getTime() - ctx.tableState.lastCsvDownload.getTime()) > 60*1000)) {
    alert(`L'eliminazione delle righe è una operazione irreversibile. Prima di procedere, usa la funzione "scarica CSV" per archiviare i dati inseriti.`)
    return
  }
  */

  const confirmed = confirm(
    `Sei sicuro di voler eliminare ${pluralize(nLines, 'riga', 'righe')}? L'operazione è irreversibile.`
  )
  
  if (!confirmed) return
  
  try {
    const selected_lines = ctx.tableState.lines.filter(line => ctx.tableState.selectedLineKeys.has(line.key))
    const ids = selected_lines
      .filter(line => line?.row?._id)
      .map(line => new ObjectId(line?.row?._id))
    const selectedLineKeys = ctx.tableState.selectedLineKeys
    const currentFocusLineKey = ctx.tableState.focusLineKey
    await ctx.mutations.deleteRows({ variables: { ids } })
    // Rimuovi subito tutte le righe selezionate dallo stato locale,
    // senza aspettare la subscription WebSocket (che potrebbe non essere attiva)
    ctx.setTableState(prev => ({
      ...prev,
      lines: prev.lines.filter(line => !selectedLineKeys.has(line.key)),
      focusLineKey: selectedLineKeys.has(currentFocusLineKey) ? '' : prev.focusLineKey,
      focusFieldName: selectedLineKeys.has(currentFocusLineKey) ? '' : prev.focusFieldName,
      selectedLineKeys: new Set(),
    }))
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

  if (selectedRowIds.length === 0) {
      alert('Nessuna riga valida selezionata per la generazione dei fogli risposte.')
      return
  }

  if (ctx.tableState.lines.filter(line => selectedLineKeys.has(line.key) && !line?.row?.data["id"]).length > 0) {
      if (!confirm('Alcune righe selezionate non hanno un ID studente valido. Vuoi comunque procedere?')) {
          return
      }
  }

  ctx.mutations.requestScanSheetGeneration({variables: {sheetId, selectedRowIds}})

  alert(`Hai richiesto la generazione di ${selectedRowIds.length === 1 ? 'un foglio' : `${selectedRowIds.length} fogli`} risposte. Vai sulla linguetta "Scansioni" per scaricare i PDF generati.`)
}

async function handleGenerateStudentIds(ctx: TableActionContext) {
  ctx.setCheckboxesState(prev => ({...prev, showHiddenColumns: true}))

  // Trova il massimo valore del campo id
  const maxId = ctx.tableState.lines.reduce((max, line) => {
    const idValue = parseInt(line.row?.data.id || '0', 10)
    return isNaN(idValue) ? max : Math.max(max, idValue)
  }, 0)

  const selectedLines = ctx.tableState.selectedLineKeys.size === 0 
    ? ctx.tableState.lines.filter(line => line.row)
    : ctx.tableState.lines.filter(line => line.row && ctx.tableState.selectedLineKeys.has(line.key))

  // Trova le righe con id vuoto
  const rowsWithEmptyId = selectedLines.filter(line => line.row && (!line.row?.data.id || line.row?.data.id === ''))
  
  if (rowsWithEmptyId.length === 0) {
    alert('Non ci sono righe con id vuoto tra quelle selezionate')
    return
  }

  const confirmed = confirm(
    `Vuoi generare ${pluralize(rowsWithEmptyId.length, 'ID studente', 'ID studenti')} a partire da ${maxId + 1}?`
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
              id: id.toString()
            }
          }
        })
      })
    )
    alert(pluralize(rowsWithEmptyId.length, 'generato un ID studente', 'generati % ID studenti'))
  } catch (error) {
    alert(`Errore durante la generazione degli ID: ${error}`)
  }
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

async function handleCreateSheets(ctx: TableActionContext) {
  const allLines = ctx.tableState.lines
  const selectedLineKeys = ctx.tableState.selectedLineKeys
  const selectedLines = allLines
    .filter(line => selectedLineKeys.has(line.key))
  const rows = selectedLines
    .map(line => line?.row)
    .filter(row => row) as Row[]
  const res = await ctx.mutations.createSheets({ variables: { 
    sheetId: ctx.sheet._id, 
    rowIds: (rows.length > 0 
      ? rows.map(row => new ObjectId(row._id)) 
      : undefined)
  }});
  if (!res.data?.createSheets) {
    alert('Errore durante la creazione dei fogli: '+JSON.stringify(res))
  } else {
    alert(`Responso: ${res.data.createSheets}`)
  }
}

function askOlimanagerCredentials(ctx: TableActionContext): {username: string, password: string} {
  const username = prompt('Username olimanager (email)', ctx.olimanagerEmail) ?? ''
  const password = prompt('Password', ctx.olimanagerPassword) ?? ''
  ctx.setOlimanagerEmail(username)
  ctx.setOlimanagerPassword(password)
  return {username, password}
}

async function handleOlimanagerCreateParticipants(ctx: TableActionContext) {
  const valid_rows = filterValidRowsAndConfirm(ctx)
  if (!valid_rows || !confirm(`Inviare ${valid_rows.length} righe a Olimanager per creazione/abbinamento partecipanti?`)) {
    return
  }

  const {username, password} = askOlimanagerCredentials(ctx)
  const res = await ctx.mutations.olimanagerCreateParticipant({ variables: { rowIds: valid_rows.map(row => new ObjectId(row._id)), username, password } }) as {data?: {olimanagerCreateParticipant?: {success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}[]}}
  
  const arr = res.data?.olimanagerCreateParticipant || []
  
  const totalSuccess = arr.filter(r => r.success).length
  const skipped = arr.filter(r => r.skipped).length
  const converted = arr.filter(r => r.converted).length
  const ok = totalSuccess - skipped - converted
  const ko = arr.length - totalSuccess
  
  const errorMessages = arr.filter(r => !r.success).map(r => r.error).filter(Boolean)
  
  let msg = `Esito Olimanager: ${ok} creati/abbinati`
  if (skipped > 0) msg += `, ${skipped} saltati`
  if (converted > 0) msg += `, ${converted} convertiti`
  msg += `, ${ko} errori`
  
  if (errorMessages.length > 0) {
      msg += '\n\nErrori:\n' + errorMessages.join('\n')
  }
  
  alert(msg)
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
}

async function handleOlimanagerUpdateExtraFields(ctx: TableActionContext) {
  const valid_rows = filterValidRowsAndConfirm(ctx)
  if (!valid_rows || !confirm(`Aggiornare gli extra fields su Olimanager per ${valid_rows.length} righe selezionate?`)) {
    return
  }
  const ids = valid_rows.map(row => new ObjectId(row._id))
  const {username, password} = askOlimanagerCredentials(ctx)

  const res = await ctx.mutations.olimanagerUpdateExtraFields({ variables: { rowIds: ids, username, password } }) as {data?: {olimanagerUpdateExtraFields?: {success: boolean, skipped: boolean, error: string}[]}}
  const arr = res.data?.olimanagerUpdateExtraFields || []
  
  const totalSuccess = arr.filter(r => r.success).length
  const skipped = arr.filter(r => r.skipped).length
  const ok = totalSuccess - skipped
  const ko = arr.length - totalSuccess
  
  const errorMessages = arr.filter(r => !r.success).map(r => r.error).filter(Boolean)
  
  let msg = `Esito Olimanager: ${ok} extra-fields aggiornati con successo`
  if (skipped > 0) msg += `, ${skipped} saltati`
  msg += `, ${ko} errori`
  
  if (errorMessages.length > 0) {
      msg += '\n\nErrori:\n' + errorMessages.join('\n')
  }
  
  alert(msg)
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

async function handleDeleteStudentIds(ctx: TableActionContext) {
  const selectedLines = ctx.tableState.selectedLineKeys.size === 0 
    ? ctx.tableState.lines.filter(line => line.row)
    : ctx.tableState.lines.filter(line => line.row && ctx.tableState.selectedLineKeys.has(line.key))

  const rowsWithId = selectedLines.filter(line => line.row && line.row.data.id)

  if (rowsWithId.length === 0) {
    alert('Non ci sono righe con ID studente tra quelle selezionate')
    return
  }

  const confirmed = confirm(
    `Vuoi eliminare gli ID studenti da ${rowsWithId.length} righe?`
  )
  
  if (!confirmed) return

  try {
    await Promise.all(
      rowsWithId.map(line => {
        if (!line.row) return Promise.resolve()
        return ctx.mutations.patchRow({
          variables: {
            _id: line.row._id,
            updatedOn: line.row.updatedOn,
            data: {
              id: ''
            }
          }
        })
      })
    )
    alert(`Eliminati ID studenti da ${rowsWithId.length} righe`)
  } catch (error) {
    alert(`Errore durante l'eliminazione degli ID: ${error}`)
  }
}

async function handleAnonymizeNames(ctx: TableActionContext) {
  const selectedLineKeys = ctx.tableState.selectedLineKeys
  const rowsToAnonymize = ctx.tableState.lines
    .filter(line => line.row && selectedLineKeys.has(line.key))
    .map(line => line.row as Row)

  if (rowsToAnonymize.length === 0) {
    alert('Nessuna riga selezionata per l\'anonimizzazione.')
    return
  }

  const confirmed = confirm(
    `Sei sicuro di voler anonimizzare i nomi in ${rowsToAnonymize.length} righe? Questa operazione è irreversibile.`
  )

  if (!confirmed) return

  // Liste di nomi e cognomi italiani comuni
  const firstNames = [
    'Marco', 'Giovanni', 'Luca', 'Alessandro', 'Andrea', 'Matteo', 'Davide', 'Simone', 'Federico', 'Antonio',
    'Francesco', 'Roberto', 'Paolo', 'Mario', 'Luigi', 'Giuseppe', 'Salvatore', 'Vincenzo', 'Angelo', 'Carlo',
    'Domenico', 'Michele', 'Stefano', 'Nicola', 'Fabio', 'Massimo', 'Giorgio', 'Pietro', 'Enrico', 'Leonardo', 
    'Johnny',
  ]
  const surnames = [
    'Rossi', 'Bianchi', 'Verdi', 'Russo', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino',
    'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi',
    'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini',
    'Walker',
  ]

  try {
    await Promise.all(
      rowsToAnonymize.map(row => {
        const updatedData = { ...row.data }
        // Trova i campi nome basati sullo schema
        const nameFields = ctx.schema.fields.filter(field => 
          ['nome', 'cognome', 'name', 'surname', 'Nome_referente', 'Cognome_referente'].includes(field.name)
        )
        nameFields.forEach(field => {
          if (updatedData[field.name]) {
            if (['nome', 'name'].includes(field.name)) {
              updatedData[field.name] = firstNames[Math.floor(Math.random() * firstNames.length)]
            } else if (['cognome', 'surname'].includes(field.name)) {
              updatedData[field.name] = surnames[Math.floor(Math.random() * surnames.length)]
            }
          }
        })
        return ctx.mutations.patchRow({
          variables: {
            _id: row._id,
            updatedOn: row.updatedOn,
            data: updatedData
          }
        })
      })
    )
    alert(`Anonimizzati i nomi in ${rowsToAnonymize.length} righe.`)
  } catch (error) {
    alert(`Errore durante l'anonimizzazione: ${error}`)
  }
}
