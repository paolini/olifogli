'use client'
import { Fragment, useState } from 'react'
import { gql, useMutation, useQuery } from '@apollo/client'
import Link from 'next/link'

import Button from './Button'
import ErrorElement from './Error'
import Loading from './Loading'
import { myTimestamp, pluralize } from '../lib/util'
import useProfile from '../lib/useProfile'

const WORKER_FILES = gql`
  query WorkerFiles {
    workerFiles {
      areas { area label kind available }
      groups { kind jobId jobExists sheetId sheetName status timestamp fileCount totalSize folders lastModified }
    }
  }
`
const GROUP_FILES = gql`
  query WorkerFileGroupFiles($kind: String!, $jobId: ObjectId) {
    workerFileGroupFiles(kind: $kind, jobId: $jobId) { area path folder size modifiedAt }
  }
`
const DELETE_FILES = gql`
  mutation DeleteWorkerFiles($files: [WorkerFileInput!]!) {
    deleteWorkerFiles(files: $files) { deleted failed { area path reason } }
  }
`
const DELETE_GROUP = gql`
  mutation DeleteWorkerFileGroup($kind: String!, $jobId: ObjectId) {
    deleteWorkerFileGroup(kind: $kind, jobId: $jobId) { deleted failed { area path reason } }
  }
`

type Area = { area: string, label: string, kind: string, available: boolean }
type Group = {
  kind: string, jobId: string | null, jobExists: boolean, sheetId: string | null, sheetName: string | null,
  status: string | null, timestamp: string | null, fileCount: number, totalSize: number,
  folders: string[], lastModified: string,
}
type File = { area: string, path: string, folder: string, size: number, modifiedAt: string }
type Deletion = { deleted: number, failed: { area: string, path: string, reason: string }[] }

const KIND_LABELS: Record<string, string> = { scan: 'scansione', sheet: 'fogli generati' }
const FOLDER_LABELS: Record<string, string> = {
  queued: 'in coda', staging: 'in scrittura', processing: 'in elaborazione', completed: 'completato',
  aborted: 'annullato', tmp: 'temporaneo', data: 'dati', other: 'altro',
}
const FAILURE_REASONS: Record<string, string> = {
  permission: "permessi insufficienti: la cartella è stata creata dal worker e l'applicazione non può scriverci",
  not_found: 'file non trovato o non più presente',
  error: 'errore imprevisto',
}
const PROCESSING_WARNING = 'Attenzione: alcuni file sono in elaborazione. Se il worker li sta ancora usando, '
  + "l'elaborazione fallirà o resterà bloccata.\n\n"

const groupKey = (group: Group) => `${group.kind}:${group.jobId ?? ''}`

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

function fileUrl(file: File, download: boolean) {
  const params = new URLSearchParams({ area: file.area, path: file.path })
  if (download) params.set('download', '1')
  return `/api/worker-files?${params}`
}

function DeletionReport({ report, areas, onClose }: { report: Deletion, areas: Area[], onClose: () => void }) {
  const areaLabels = new Map(areas.map(area => [area.area, area.label]))
  const reasons = [...new Set(report.failed.map(failure => failure.reason))]
  return <div role="status" className={`my-2 p-2 border rounded ${report.failed.length ? 'border-red-600' : 'border-green-600'}`}>
    <p>
      {pluralize(report.deleted, 'file cancellato', 'file cancellati')}
      {report.failed.length > 0 && <>; <b>{pluralize(report.failed.length, 'file non cancellato', 'file non cancellati')}</b></>}.
      {} <button type="button" className="text-blue-600 underline" onClick={onClose}>chiudi</button>
    </p>
    {reasons.map(reason => <p key={reason}>{FAILURE_REASONS[reason] ?? reason}</p>)}
    {report.failed.length > 0 && <>
      {reasons.includes('permission') && <p>
        Questi file vanno cancellati sul server; vedi «Permessi dei file» in <code>docs/omr.md</code>.
      </p>}
      <details>
        <summary>elenco dei file non cancellati</summary>
        <ul>
          {report.failed.map(failure => <li key={`${failure.area}/${failure.path}`}>
            {areaLabels.get(failure.area) ?? failure.area}: <code>{failure.path}</code>
          </li>)}
        </ul>
      </details>
    </>}
  </div>
}

export default function WorkerFiles() {
  const profile = useProfile()
  const { data, error, loading, refetch } = useQuery<{ workerFiles: { areas: Area[], groups: Group[] } }>(WORKER_FILES, {
    fetchPolicy: 'network-only', skip: !profile?.isAdmin,
  })
  const [deleteGroup, deleteGroupState] = useMutation(DELETE_GROUP)
  const [kind, setKind] = useState('')
  const [orphansOnly, setOrphansOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [report, setReport] = useState<Deletion | null>(null)

  if (profile === undefined) return <Loading />
  if (!profile?.isAdmin) return <p>Pagina riservata agli amministratori.</p>
  if (error) return <ErrorElement error={error} />
  if (loading || !data) return <Loading />

  const { areas, groups: allGroups } = data.workerFiles
  const groups = allGroups.filter(group => (!kind || group.kind === kind) && (!orphansOnly || !group.jobExists))
  const selectedGroups = groups.filter(group => selected.includes(groupKey(group)))
  const totalSize = groups.reduce((total, group) => total + group.totalSize, 0)
  const fileCount = groups.reduce((total, group) => total + group.fileCount, 0)

  async function removeGroups(targets: Group[]) {
    const files = targets.reduce((total, group) => total + group.fileCount, 0)
    const warning = targets.some(group => group.folders.includes('processing')) ? PROCESSING_WARNING : ''
    if (!window.confirm(`${warning}Cancellare ${pluralize(files, 'file', 'file')} di `
      + `${pluralize(targets.length, 'lavoro', 'lavori')}? I lavori nel database non vengono modificati.`)) return
    const total: Deletion = { deleted: 0, failed: [] }
    try {
      for (const group of targets) {
        const result = await deleteGroup({ variables: { kind: group.kind, jobId: group.jobId } })
        const deletion: Deletion | undefined = result.data?.deleteWorkerFileGroup
        if (!deletion) continue
        total.deleted += deletion.deleted
        total.failed.push(...deletion.failed)
      }
    } finally {
      setReport(total)
    }
    setSelected([])
    setExpanded(null)
    await refetch()
  }

  return <div className="mx-2">
    <h1>file dei worker</h1>
    <p className="my-2">
      File condivisi con i worker <b>oliscan</b> e <b>olisheet</b> di archiomr, raggruppati per lavoro.
      La cancellazione elimina solo i file: scansioni e fogli generati restano nel database,
      ma immagini e PDF cancellati non saranno più visibili.
    </p>
    <ul className="my-2">
      {areas.map(area => <li key={area.area}>
        {area.label}{area.available ? '' : <span className="text-red-600"> — directory non disponibile</span>}
      </li>)}
    </ul>

    <div className="my-2 flex flex-wrap items-center gap-4">
      <label>tipo {}
        <select value={kind} onChange={e => setKind(e.target.value)} className="border rounded px-1">
          <option value="">tutti</option>
          <option value="scan">scansioni</option>
          <option value="sheet">fogli generati</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={orphansOnly} onChange={e => setOrphansOnly(e.target.checked)} /> solo
        lavori non più presenti nel database
      </label>
      <Button onClick={async () => { await refetch() }}>Aggiorna</Button>
      <Button variant="danger" disabled={selectedGroups.length === 0 || deleteGroupState.loading}
        onClick={() => removeGroups(selectedGroups)}>
        Elimina i file {selectedGroups.length > 0 ? `di ${pluralize(selectedGroups.length, 'lavoro', 'lavori')}` : 'selezionati'}
      </Button>
    </div>
    {deleteGroupState.error && <ErrorElement error={deleteGroupState.error} />}
    {report && <DeletionReport report={report} areas={areas} onClose={() => setReport(null)} />}

    <p className="my-2">
      {pluralize(groups.length, 'lavoro', 'lavori')}, {pluralize(fileCount, 'file', 'file')}, {formatSize(totalSize)}
    </p>

    {groups.length > 0 && <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" aria-label="Seleziona tutti i lavori"
              checked={selectedGroups.length === groups.length}
              onChange={e => setSelected(e.target.checked ? groups.map(groupKey) : [])} />
          </th>
          <th>tipo</th><th>lavoro</th><th>foglio</th><th>stato</th><th>cartelle</th>
          <th>file</th><th>dimensione</th><th>ultima modifica</th><th></th>
        </tr>
      </thead>
      <tbody>
        {groups.map(group => {
          const key = groupKey(group)
          return <Fragment key={key}>
            <tr>
              <td>
                <input type="checkbox" aria-label={`Seleziona il lavoro ${group.jobId ?? 'senza ID'}`}
                  checked={selected.includes(key)}
                  onChange={e => setSelected(list => e.target.checked ? [...list, key] : list.filter(k => k !== key))} />
              </td>
              <td>{KIND_LABELS[group.kind] ?? group.kind}</td>
              <td><code>{group.jobId ?? 'senza lavoro'}</code></td>
              <td>
                {group.sheetId
                  ? <Link href={`/sheet/${group.sheetId}`} className="text-blue-600 underline">{group.sheetName ?? group.sheetId}</Link>
                  : group.jobId && <i>lavoro non presente nel database</i>}
              </td>
              <td>{group.status ?? ''}</td>
              <td>{group.folders.map(folder => FOLDER_LABELS[folder] ?? folder).join(', ')}</td>
              <td className="text-right">{group.fileCount}</td>
              <td className="text-right">{formatSize(group.totalSize)}</td>
              <td>{myTimestamp(group.lastModified)}</td>
              <td className="whitespace-nowrap">
                <button type="button" className="text-blue-600 underline mr-2"
                  aria-expanded={expanded === key}
                  onClick={() => setExpanded(expanded === key ? null : key)}>
                  {expanded === key ? 'nascondi' : 'mostra'}
                </button>
                <button type="button" className="text-red-600 underline" disabled={deleteGroupState.loading}
                  onClick={() => removeGroups([group])}>
                  elimina
                </button>
              </td>
            </tr>
            {expanded === key && <tr>
              <td colSpan={10}>
                <GroupFiles group={group} areas={areas} onDeleted={async deletion => {
                  setReport(deletion)
                  await refetch()
                }} />
              </td>
            </tr>}
          </Fragment>
        })}
      </tbody>
    </table>}
  </div>
}

function GroupFiles({ group, areas, onDeleted }: {
  group: Group, areas: Area[], onDeleted: (deletion: Deletion) => Promise<void>,
}) {
  const { data, error, loading, refetch } = useQuery<{ workerFileGroupFiles: File[] }>(GROUP_FILES, {
    variables: { kind: group.kind, jobId: group.jobId }, fetchPolicy: 'network-only',
  })
  const [deleteFiles, deleteState] = useMutation(DELETE_FILES)
  if (error) return <ErrorElement error={error} />
  if (loading || !data) return <Loading />
  const areaLabels = new Map(areas.map(area => [area.area, area.label]))

  async function remove(file: File) {
    const warning = file.folder === 'processing' ? PROCESSING_WARNING : ''
    if (!window.confirm(`${warning}Cancellare ${file.path}?`)) return
    const result = await deleteFiles({ variables: { files: [{ area: file.area, path: file.path }] } })
    await refetch()
    if (result.data) await onDeleted(result.data.deleteWorkerFiles)
  }

  return <>
    {deleteState.error && <ErrorElement error={deleteState.error} />}
    {data.workerFileGroupFiles.length === 0
      ? <p>Nessun file.</p>
      : <table className="w-full">
        <thead>
          <tr><th>directory</th><th>cartella</th><th>file</th><th>dimensione</th><th>modifica</th><th></th></tr>
        </thead>
        <tbody>
          {data.workerFileGroupFiles.map(file => <tr key={`${file.area}/${file.path}`}>
            <td>{areaLabels.get(file.area) ?? file.area}</td>
            <td>{FOLDER_LABELS[file.folder] ?? file.folder}</td>
            <td><code>{file.path}</code></td>
            <td className="text-right">{formatSize(file.size)}</td>
            <td>{myTimestamp(file.modifiedAt)}</td>
            <td className="whitespace-nowrap">
              <a href={fileUrl(file, false)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline mr-2">apri</a>
              <a href={fileUrl(file, true)} className="text-blue-600 underline mr-2">scarica</a>
              <button type="button" className="text-red-600 underline" disabled={deleteState.loading}
                onClick={() => remove(file)}>
                elimina
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>}
  </>
}
