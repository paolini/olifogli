'use client'
import { useState } from 'react'
import { gql, useQuery, useMutation } from '@apollo/client'
import { Check, Copy } from 'lucide-react'
import type { ObjectId } from 'bson'
import Button from './Button'
import ErrorElement from './Error'

const GET_JOBS = gql`
  query OlimanagerJobs($sheetIds: [ObjectId!]) {
    olimanagerJobs(sheetIds: $sheetIds) {
      _id operation checkMode status totalRows succeededRows failedRows skippedRows createdAt error
    }
  }
`
const GET_ITEMS = gql`
  query OlimanagerJobItems($jobId: ObjectId!, $after: ObjectId, $limit: Int) {
    olimanagerJobItems(jobId: $jobId, after: $after, limit: $limit) {
      _id rowId rowSurname sheetId sheetName status attempts error checkResult differences participantId competitorId competitorCreated participantCreated multipleCompetitorsMatched
    }
  }
`
const RESUME_JOB = gql`
  mutation ResumeOlimanagerCheck($jobId: ObjectId!) {
    resumeOlimanagerCheck(jobId: $jobId) { _id status }
  }
`
const statusLabels: Record<string, string> = {
  queued: 'In attesa del worker', preparing: 'Preparazione', running: 'In corso',
  completed: 'Completato', completed_with_errors: 'Completato con errori', failed: 'Fallito',
  pending: 'In attesa', succeeded: 'Completata', skipped: 'Saltata', needs_login: 'In attesa di nuovo login OAuth',
  matched: 'Collegamento valido e anagrafica corrispondente', unmatched: 'Non abbinata', different: 'Anagrafica diversa',
  not_found: 'Partecipante non trovato nella gara prevista', wrong_contest: 'Gara diversa', wrong_school: 'Scuola diversa',
  unverifiable: 'Operazione non riuscita', created: 'Partecipante creato', linked: 'Partecipante trovato e collegato',
  results_updated: 'Risultati inviati',
  already_linked: 'Collegamento già presente e verificato', absent: 'Assente: operazione saltata',
}
type Job = { _id: string, operation: string, checkMode?: string | null, skippedRows?: number | null, status: string, totalRows: number, succeededRows: number, failedRows: number, createdAt: string, error?: string }
type Item = { _id: string, competitorCreated?: boolean, multipleCompetitorsMatched?: boolean, checkResult?: string | null, differences?: string[], participantId?: string, competitorId?: string, rowId: string, rowSurname?: string | null, sheetId?: string, sheetName?: string | null, status: string, attempts: number, error?: string }

export default function OlimanagerJobStatus({ sheetIds }: { sheetIds?: ObjectId[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const { data, error, loading, refetch } = useQuery<{ olimanagerJobs: Job[] }>(GET_JOBS, {
    variables: { sheetIds }, fetchPolicy: 'network-only',
  })
  const items = useQuery<{ olimanagerJobItems: Item[] }>(GET_ITEMS, {
    variables: { jobId: selected, limit: 100 }, skip: !selected, fetchPolicy: 'network-only',
  })
  const [resume, resumeState] = useMutation(RESUME_JOB, { refetchQueries: ['OlimanagerJobs'] })
  const entries = items.data?.olimanagerJobItems || []
  return <section className="my-4 border rounded p-3 hide-print">
    <div className="flex items-center gap-3">
      <b>Lavori Olimanager</b>
      <Button disabled={loading || items.loading} onClick={async () => {
        await refetch()
        if (selected) await items.refetch({ jobId: selected, after: null, limit: 100 })
      }}>Aggiorna stato</Button>
    </div>
    <p>Le verifiche leggono i collegamenti; gli altri lavori creano/abbinano partecipanti o aggiornano i risultati su Olimanager.</p>
    {resumeState.error && <ErrorElement error={resumeState.error} />}
    {error && <ErrorElement error={error} />}
    {!loading && data?.olimanagerJobs.length === 0 && <p>Nessun lavoro accodato.</p>}
    <ul>{data?.olimanagerJobs.map(job => <li key={job._id} className="my-2">
      {job.operation === 'update_results' ? 'Invio risultati' : job.operation === 'match_or_create_participants' ? 'Crea/abbina partecipanti' : job.checkMode === 'remote' ? 'Verifica collegamenti' : 'Verifica locale'} — {new Date(job.createdAt).toLocaleString('it-IT')}: {statusLabels[job.status] || job.status}
      {' — '}{job.succeededRows + job.failedRows + (job.skippedRows || 0)}/{job.totalRows} righe, {job.failedRows} errori, {job.skippedRows || 0} {job.operation === 'check_participants' ? 'non abbinate' : 'saltate'}.
      <Button className="ml-2" onClick={() => setSelected(selected === job._id ? null : job._id)}>Dettagli righe</Button>
      {job.status === 'needs_login' && <Button className="ml-2" disabled={resumeState.loading} onClick={async () => {
        try { await resume({ variables: { jobId: job._id } }) } catch { /* Apollo exposes the error above. */ }
      }}>Riprendi con la sessione attuale</Button>}
      {job.error && <p className="text-red-700">{job.error}</p>}
    </li>)}</ul>
    {selected && <div>
      {items.error && <ErrorElement error={items.error} />}
      <ul>{entries.map(item => <li key={item._id}>
        {item.sheetId && <a className="underline" href={`/sheet/${item.sheetId}`}>{item.sheetName || 'Foglio'}</a>}
        {' — '}{item.rowSurname || 'Riga'} <CopyRowId rowId={String(item.rowId)} />: {statusLabels[item.checkResult || item.status] || item.status}
        {item.participantId && <span> — partecipante {item.participantId}</span>}
        {item.competitorCreated && <span> — nuova anagrafica</span>}
        {item.multipleCompetitorsMatched && <span className="text-amber-700"> — Più anagrafiche compatibili: verificare l’abbinamento.</span>}
        {item.error && <span className="text-red-700"> — {item.error}</span>}
      </li>)}</ul>
      {entries.length > 0 && entries.length < (data?.olimanagerJobs.find(job => job._id === selected)?.totalRows || 0) && <Button disabled={items.loading} onClick={async () => {
        await items.fetchMore({ variables: { after: entries.at(-1)!._id },
          updateQuery: (previous, { fetchMoreResult }) => ({ olimanagerJobItems: [
            ...previous.olimanagerJobItems, ...(fetchMoreResult?.olimanagerJobItems || []),
          ] }),
        })
      }}>Mostra altre righe</Button>}
    </div>}
  </section>
}

function CopyRowId({ rowId }: { rowId: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  return <>
    <button type="button" className="inline-flex items-center gap-1 rounded p-1 text-gray-600 hover:bg-gray-100"
      title="Copia ID riga" aria-label="Copia ID riga" onClick={async () => {
        try {
          await navigator.clipboard.writeText(rowId)
          setStatus('copied')
        } catch {
          setStatus('failed')
        }
      }}>
      {status === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
    <span role="status" className="text-xs">
      {status === 'copied' && 'Copiato'}
      {status === 'failed' && <>Copia non riuscita: <code className="select-all">{rowId}</code></>}
    </span>
  </>
}
