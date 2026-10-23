'use client'
import { useState } from 'react'
import { gql, useQuery, useMutation } from '@apollo/client'
import type { ObjectId } from 'bson'
import Button from './Button'
import ErrorElement from './Error'

const GET_JOBS = gql`
  query OlimanagerJobs($sheetIds: [ObjectId!]) {
    olimanagerJobs(sheetIds: $sheetIds) {
      _id checkMode status totalRows succeededRows failedRows skippedRows createdAt error
    }
  }
`
const GET_ITEMS = gql`
  query OlimanagerJobItems($jobId: ObjectId!, $after: ObjectId, $limit: Int) {
    olimanagerJobItems(jobId: $jobId, after: $after, limit: $limit) {
      _id rowId sheetId status attempts error checkResult differences participantId competitorId
    }
  }
`
const RESUME_JOB = gql`
  mutation ResumeOlimanagerCheck($jobId: ObjectId!) {
    resumeOlimanagerCheck(jobId: $jobId) { _id status }
  }
`
const statusLabels: Record<string, string> = {
  queued: 'In attesa del worker', preparing: 'Preparazione', running: 'Verifica in corso',
  completed: 'Verifica completata', completed_with_errors: 'Verifica completata con errori', failed: 'Verifica fallita',
  pending: 'Da verificare', succeeded: 'Verificata', skipped: 'Non abbinata', needs_login: 'In attesa di nuovo login OAuth',
  matched: 'Collegamento valido e anagrafica corrispondente', unmatched: 'Non abbinata', different: 'Anagrafica diversa',
  not_found: 'Partecipante non trovato nella gara prevista', wrong_contest: 'Gara diversa', wrong_school: 'Scuola diversa',
  unverifiable: 'Verifica non riuscita',
}
type Job = { _id: string, checkMode?: string | null, skippedRows?: number | null, status: string, totalRows: number, succeededRows: number, failedRows: number, createdAt: string, error?: string }
type Item = { _id: string, checkResult?: string | null, differences?: string[], participantId?: string, competitorId?: string, rowId: string, sheetId?: string, status: string, attempts: number, error?: string }

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
      <b>Verifiche Olimanager</b>
      <Button disabled={loading || items.loading} onClick={async () => {
        await refetch()
        if (selected) await items.refetch({ jobId: selected, after: null, limit: 100 })
      }}>Aggiorna stato</Button>
    </div>
    <p>Controllo in sola lettura: nessun dato viene modificato su Olimanager.</p>
    {resumeState.error && <ErrorElement error={resumeState.error} />}
    {error && <ErrorElement error={error} />}
    {!loading && data?.olimanagerJobs.length === 0 && <p>Nessun lavoro accodato.</p>}
    <ul>{data?.olimanagerJobs.map(job => <li key={job._id} className="my-2">
      {job.checkMode === 'remote' ? 'Collegamenti' : 'Verifica locale'} — {new Date(job.createdAt).toLocaleString('it-IT')}: {statusLabels[job.status] || job.status}
      {' — '}{job.succeededRows + job.failedRows + (job.skippedRows || 0)}/{job.totalRows} righe, {job.failedRows} errori, {job.skippedRows || 0} non abbinate.
      <Button className="ml-2" onClick={() => setSelected(selected === job._id ? null : job._id)}>Dettagli righe</Button>
      {job.status === 'needs_login' && <Button className="ml-2" disabled={resumeState.loading} onClick={async () => {
        try { await resume({ variables: { jobId: job._id } }) } catch { /* Apollo exposes the error above. */ }
      }}>Riprendi con la sessione attuale</Button>}
      {job.error && <p className="text-red-700">{job.error}</p>}
    </li>)}</ul>
    {selected && <div>
      {items.error && <ErrorElement error={items.error} />}
      <ul>{entries.map(item => <li key={item._id}>
        {item.sheetId && <a className="underline" href={`/sheet/${item.sheetId}`}>Foglio</a>}
        {' — Riga '}{item.rowId}: {statusLabels[item.checkResult || item.status] || item.status}
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
