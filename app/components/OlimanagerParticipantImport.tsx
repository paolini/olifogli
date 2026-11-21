import { gql } from '@apollo/client'
import { useState } from 'react'
import { ObjectId } from 'bson'
import { useGetSheetsQuery, useOlimanagerImportQuery, useRequestOlimanagerImportMutation, useConfirmOlimanagerImportMutation, useCancelOlimanagerImportMutation, useResumeOlimanagerImportMutation } from '../graphql/generated'
import { VENUE_SHEET_SCHEMAS, isParticipantImportSchema } from '../lib/olimanagerVenueSheetConfig'
import { sheetContest } from '../lib/olimanagerVenueSheetPlan'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'

const _ = gql`
    query OlimanagerImport($workbookId: ObjectId!) {
        olimanagerImport(workbookId: $workbookId) {
            schema contestId warnings alreadyPresentRows
            job { _id status totalRows succeededRows failedRows skippedRows createdAt finishedAt error }
            sheets { sheetId sheetName existingRows newRows participants }
        }
    }
    mutation RequestOlimanagerImport($workbookId: ObjectId!, $schema: String!, $contestId: Int!) {
        requestOlimanagerImport(workbookId: $workbookId, schema: $schema, contestId: $contestId) { _id status }
    }
    mutation ConfirmOlimanagerImport($jobId: ObjectId!) {
        confirmOlimanagerImport(jobId: $jobId) { _id status }
    }
    mutation CancelOlimanagerImport($jobId: ObjectId!) {
        cancelOlimanagerImport(jobId: $jobId) { _id status }
    }
    mutation ResumeOlimanagerImport($jobId: ObjectId!) {
        resumeOlimanagerCheck(jobId: $jobId) { _id status }
    }
`

const ACTIVE = ['queued', 'preparing', 'running']
const FINAL = ['completed', 'completed_with_errors', 'failed', 'cancelled']
const STATUS: Record<string, string> = {
    queued: 'in attesa del worker', preparing: 'lettura da Olimanager in corso', running: 'creazione delle righe in corso',
    awaiting_confirmation: 'anteprima pronta, in attesa di conferma', needs_login: 'in attesa di un nuovo login OAuth',
    completed: 'completata', completed_with_errors: 'completata con errori', failed: 'fallita', cancelled: 'annullata',
}

export default function OlimanagerParticipantImport({ workbookId, done }: { workbookId: ObjectId, done: () => void }) {
    const sheets = useGetSheetsQuery({ variables: { workbookId } })
    const [polling, setPolling] = useState(false)
    // Job notifications also refetch this query; polling covers a missing WebSocket.
    const current = useOlimanagerImportQuery({ variables: { workbookId }, fetchPolicy: 'network-only', pollInterval: polling ? 3000 : 0,
        onCompleted: data => setPolling(ACTIVE.includes(data.olimanagerImport?.job.status || '')) })
    const options = { refetchQueries: ['OlimanagerImport', 'OlimanagerJobs', 'BackgroundJobsStatus'], awaitRefetchQueries: true }
    const [request, requesting] = useRequestOlimanagerImportMutation(options)
    const [confirm, confirming] = useConfirmOlimanagerImportMutation(options)
    const [cancel, cancelling] = useCancelOlimanagerImportMutation(options)
    const [resume, resuming] = useResumeOlimanagerImportMutation(options)
    const [choice, setChoice] = useState('')
    const [failure, setFailure] = useState('')

    if (sheets.loading || current.loading && !current.data) return <Loading />
    const busy = requesting.loading || confirming.loading || cancelling.loading || resuming.loading
    // Targets: schema and contest pairs of the workbook's sheets.
    const targets = new Map<string, { schema: string, contestId: number, count: number }>()
    for (const sheet of sheets.data?.sheets || []) {
        const contest = sheetContest(sheet)
        if (!isParticipantImportSchema(sheet.schema) || !/^\d+$/.test(contest)) continue
        const key = `${sheet.schema}:${contest}`
        targets.set(key, { schema: sheet.schema, contestId: Number(contest), count: (targets.get(key)?.count || 0) + 1 })
    }
    const selected = targets.get(choice) || (targets.size === 1 ? [...targets.values()][0] : undefined)
    const label = (schema: string) => isParticipantImportSchema(schema) ? VENUE_SHEET_SCHEMAS[schema].label : schema
    const importState = current.data?.olimanagerImport
    const job = importState?.job
    const run = async (action: () => Promise<unknown>) => {
        setFailure('')
        try { await action(); setPolling(true) }
        catch (error) { setFailure(error instanceof globalThis.Error ? error.message : String(error)) }
    }
    const newRows = importState?.sheets.reduce((n, s) => n + s.newRows, 0) || 0

    return <div className="space-y-3">
        <p>Importazione dei partecipanti da Olimanager nei fogli di una gara distrettuale (o della gara delle prime). Il worker legge i
            partecipanti del contest e li assegna al foglio del distretto della loro sede; prima di creare le righe mostra
            un’anteprima da confermare. Le righe esistenti non vengono modificate né cancellate: rilanciando l’importazione si
            aggiungono solo i partecipanti nuovi.</p>
        <Error error={sheets.error || current.error || failure} />
        {job && <section className="border rounded p-3 space-y-2">
            <p><b>Ultima importazione</b> ({label(importState.schema)}, contest #{importState.contestId},
                {' '}{new Date(job.createdAt).toLocaleString('it-IT')}): {STATUS[job.status] || job.status}.</p>
            {job.error && <p className="text-red-700">{job.error}</p>}
            {ACTIVE.includes(job.status) && <p>Lo stato si aggiorna automaticamente. Il worker Olifogli deve essere in esecuzione
                (vedi l’ingranaggio in alto).{job.status === 'running' && ` Righe elaborate: ${job.succeededRows + job.failedRows + (job.skippedRows || 0)}/${job.totalRows}.`}</p>}
            {job.status === 'needs_login' && <p>
                <Button disabled={busy} onClick={() => run(() => resume({ variables: { jobId: job._id } }))}>Riprendi con la sessione attuale</Button>
                <Button variant="secondary" className="ml-2" disabled={busy} onClick={() => run(() => cancel({ variables: { jobId: job._id } }))}>Annulla l’importazione</Button>
            </p>}
            {(job.status === 'awaiting_confirmation' || FINAL.includes(job.status)) && job.status !== 'failed' && job.status !== 'cancelled' && <>
                {job.status === 'awaiting_confirmation'
                    ? <p>Righe da creare: <b>{newRows}</b>. Partecipanti già presenti nei fogli: {importState.alreadyPresentRows}.</p>
                    : <p>Righe create: <b>{job.succeededRows}</b>; saltate perché già presenti: {job.skippedRows || 0}; errori: {job.failedRows}.
                        {' '}Partecipanti già presenti al momento dell’anteprima: {importState.alreadyPresentRows}.</p>}
                {importState.warnings.length > 0 && <details open={importState.warnings.length <= 10}>
                    <summary>{importState.warnings.length} segnalazioni</summary>
                    <ul className="list-disc ml-6">{importState.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
                </details>}
                {job.status === 'awaiting_confirmation' && <>
                    <table><thead><tr><th>Foglio</th><th>Righe presenti</th><th>Righe nuove</th><th>Partecipanti nuovi</th></tr></thead><tbody>
                        {importState.sheets.map(sheet => <tr key={String(sheet.sheetId)} className={sheet.newRows ? 'bg-green-100' : ''}>
                            <td>{sheet.sheetName}</td><td>{sheet.existingRows}</td><td>{sheet.newRows}</td>
                            <td>{sheet.participants.length > 0 && <details>
                                <summary>elenco</summary>
                                <ul>{sheet.participants.map((p, i) => <li key={i}>{p}</li>)}</ul>
                            </details>}</td>
                        </tr>)}
                    </tbody></table>
                    <p>
                        <Button disabled={busy || !newRows} onClick={() => run(() => confirm({ variables: { jobId: job._id } }))}>Importa {newRows} righe</Button>
                        <Button variant="secondary" className="ml-2" disabled={busy} onClick={() => run(() => cancel({ variables: { jobId: job._id } }))}>Annulla l’importazione</Button>
                    </p>
                </>}
            </>}
        </section>}
        {(!job || FINAL.includes(job.status)) && <section className="space-y-2">
            {targets.size === 0
                ? <p>Nessun foglio del raccoglitore è stato creato da Olimanager per una gara distrettuale: crearli prima con «Crea fogli da Olimanager».</p>
                : <>
                    <label>Fogli <select disabled={busy} value={selected ? `${selected.schema}:${selected.contestId}` : ''} onChange={e => setChoice(e.target.value)}>
                        <option value="">Seleziona schema e contest</option>
                        {[...targets].map(([key, t]) => <option key={key} value={key}>{label(t.schema)} — contest #{t.contestId} ({t.count} fogli)</option>)}
                    </select></label>
                    <p>La lettura usa la sessione OAuth corrente, che deve avere lo scope api.</p>
                    <Button disabled={busy || !selected} onClick={() => run(() => request({ variables: { workbookId, schema: selected!.schema, contestId: selected!.contestId } }))}>
                        Leggi i partecipanti da Olimanager
                    </Button>
                </>}
        </section>}
        <Button variant="secondary" disabled={busy} onClick={done}>Chiudi</Button>
    </div>
}
