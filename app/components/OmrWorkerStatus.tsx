'use client'
import { gql, useQuery } from '@apollo/client'
import useProfile from '../lib/useProfile'

const GET_OMR_WORKER_STATUS = gql`
  query OmrWorkerStatus {
    omrWorkerStatus {
      type running activeWorkers lastSeenAt
      instances { version state jobId busySince stuck }
    }
  }
`
type Instance = { version: string, state: string, jobId?: string | null, busySince?: string | null, stuck: boolean }
type Status = { type: string, running: boolean, activeWorkers: number, lastSeenAt?: string | null, instances: Instance[] }

const labels: Record<string, { name: string, offline: string }> = {
  oliscan: { name: 'Lettore scansioni', offline: 'i PDF caricati resteranno in coda finché non riparte' },
  olisheet: { name: 'Generatore fogli', offline: 'le richieste resteranno in coda finché non riparte' },
}

const time = (value: string) => new Date(value).toLocaleString('it-IT')

/** Presence of an archiomr worker (oliscan or olisheet), refreshed every 10 seconds. */
export default function OmrWorkerStatus({ type }: { type: 'oliscan' | 'olisheet' }) {
  const { data, error } = useQuery<{ omrWorkerStatus: Status[] }>(GET_OMR_WORKER_STATUS, {
    fetchPolicy: 'network-only', pollInterval: 10_000,
  })
  const isAdmin = !!useProfile()?.isAdmin
  const label = labels[type]
  const status = data?.omrWorkerStatus.find(worker => worker.type === type)
  const stuck = status?.instances.filter(instance => instance.stuck) || []
  const busy = status?.instances.filter(instance => instance.state === 'busy') || []
  const versions = [...new Set(status?.instances.map(instance => instance.version).filter(Boolean) || [])]

  if (error) return <p role="status" className="my-2 text-amber-700">{label.name}: <b>stato non verificabile</b></p>
  if (!status) return isAdmin ? <p role="status" className="my-2 text-gray-700">⚙ {label.name}: verifica in corso…</p> : null
  if (!status.running) return <p role="status" className="my-2 text-amber-700">
    {label.name}: <b>non attivo</b>, {label.offline}.
    {status.lastSeenAt && ` Ultimo segnale: ${time(status.lastSeenAt)}.`}
  </p>
  if (!isAdmin && stuck.length === 0) return null
  return <div role="status" className="my-2">
    {isAdmin && <p className="text-green-700">
      ⚙ {label.name}: <b>attivo</b>
      {versions.length > 0 && ` — ${versions.length === 1 ? 'versione' : 'versioni'} ${versions.join(', ')}`}
      {status.activeWorkers > 1 && ` (${status.activeWorkers} istanze)`}
      {busy.length > 0 ? ', elaborazione in corso.' : ', in attesa di lavori.'}
    </p>}
    {stuck.map((instance, i) => <p key={i} className="text-amber-700">
      Attenzione: un&apos;elaborazione è in corso da più di 30 minuti
      {instance.busySince && ` (dal ${time(instance.busySince)})`}: il {label.name.toLowerCase()} potrebbe essere bloccato.
    </p>)}
  </div>
}
