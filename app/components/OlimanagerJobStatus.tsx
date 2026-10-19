'use client'
import { useState } from 'react'
import { gql, useQuery } from '@apollo/client'
import type { ObjectId } from 'bson'
import Button from './Button'
import ErrorElement from './Error'

const GET_JOBS = gql`
  query OlimanagerJobs($sheetIds: [ObjectId!]) {
    olimanagerJobs(sheetIds: $sheetIds) {
      _id status totalRows succeededRows failedRows createdAt error
    }
  }
`
const GET_ITEMS = gql`
  query OlimanagerJobItems($jobId: ObjectId!, $after: ObjectId, $limit: Int) {
    olimanagerJobItems(jobId: $jobId, after: $after, limit: $limit) {
      _id rowId sheetId status attempts error
    }
  }
`
const statusLabels: Record<string, string> = {
  queued: 'In attesa del worker', preparing: 'Preparazione', running: 'Verifica in corso',
  completed: 'Verifica completata', completed_with_errors: 'Verifica completata con errori', failed: 'Verifica fallita',
  pending: 'Da verificare', succeeded: 'Verificata',
}
type Job = { _id: string, status: string, totalRows: number, succeededRows: number, failedRows: number, createdAt: string, error?: string }
type Item = { _id: string, rowId: string, sheetId?: string, status: string, attempts: number, error?: string }

export default function OlimanagerJobStatus({ sheetIds }: { sheetIds: ObjectId[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const { data, error, loading, refetch } = useQuery<{ olimanagerJobs: Job[] }>(GET_JOBS, {
    variables: { sheetIds }, fetchPolicy: 'network-only',
  })
  const items = useQuery<{ olimanagerJobItems: Item[] }>(GET_ITEMS, {
    variables: { jobId: selected, limit: 100 }, skip: !selected, fetchPolicy: 'network-only',
  })
  const entries = items.data?.olimanagerJobItems || []
  return <section className="my-4 border rounded p-3 hide-print">
    <div className="flex items-center gap-3">
      <b>Verifiche Olimanager</b>
      <Button disabled={loading || items.loading} onClick={async () => {
        await refetch()
        if (selected) await items.refetch({ jobId: selected, after: null, limit: 100 })
      }}>Aggiorna stato</Button>
    </div>
    <p>Queste verifiche non inviano dati a Olimanager.</p>
    {error && <ErrorElement error={error} />}
    {!loading && data?.olimanagerJobs.length === 0 && <p>Nessun lavoro accodato per questi fogli.</p>}
    <ul>{data?.olimanagerJobs.map(job => <li key={job._id} className="my-2">
      {new Date(job.createdAt).toLocaleString('it-IT')}: {statusLabels[job.status] || job.status}
      {' — '}{job.succeededRows + job.failedRows}/{job.totalRows} righe, {job.failedRows} errori.
      <Button className="ml-2" onClick={() => setSelected(selected === job._id ? null : job._id)}>Dettagli righe</Button>
      {job.error && <p className="text-red-700">{job.error}</p>}
    </li>)}</ul>
    {selected && <div>
      {items.error && <ErrorElement error={items.error} />}
      <ul>{entries.map(item => <li key={item._id}>
        {item.sheetId && <a className="underline" href={`/sheet/${item.sheetId}`}>Foglio</a>}
        {' — Riga '}{item.rowId}: {statusLabels[item.status] || item.status}
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
