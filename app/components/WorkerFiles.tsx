'use client'
import { ReactNode, useState } from 'react'
import { gql, useMutation, useQuery } from '@apollo/client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import Button from './Button'
import { HeaderBreadcrumbs, type Breadcrumb } from './BreadcrumbsProvider'
import ErrorElement from './Error'
import Loading from './Loading'
import { myTimestamp, pluralize } from '../lib/util'
import useProfile from '../lib/useProfile'

const WORKER_FILES = gql`
  query WorkerFiles {
    workerFiles {
      areas { area label kind available }
      groups {
        kind jobId jobExists sheetId sheetName workbookId workbookName
        status timestamp fileCount totalSize folders lastModified
      }
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
  workbookId: string | null, workbookName: string | null,
  status: string | null, timestamp: string | null, fileCount: number, totalSize: number,
  folders: string[], lastModified: string,
}
type File = { area: string, path: string, folder: string, size: number, modifiedAt: string }
type Deletion = { deleted: number, failed: { area: string, path: string, reason: string }[] }

// Posizione nel browser, salvata nei parametri dell'URL: tipo (scan, sheet
// oppure orphans) → raccoglitore → foglio → lavoro. Per gli orfani si passa
// direttamente dal tipo al lavoro.
type Place = { kind?: string, workbook?: string, sheet?: string, job?: string }
const PLACE_KEYS = ['kind', 'workbook', 'sheet', 'job'] as const
const ORPHANS = 'orphans'
const MISSING = '-' // raccoglitore o foglio non più presente nel database

const KIND_LABELS: Record<string, string> = { scan: 'Scansioni', sheet: 'Fogli generati', [ORPHANS]: 'Orfani' }
const JOB_LABELS: Record<string, string> = { scan: 'scansione', sheet: 'fogli generati' }
const STATUS_LABELS: Record<string, string> = {
  completed: 'completato', error: 'errore', processing: 'in elaborazione', pending: 'in attesa',
}
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
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg']

const groupKey = (group: Group) => `${group.kind}:${group.jobId ?? ''}`
const workbookKey = (group: Group) => group.workbookId ?? MISSING
const sheetKey = (group: Group) => group.sheetId ?? MISSING
const workbookLabel = (group: Group) => group.workbookName ?? 'raccoglitore non trovato'
const sheetLabel = (group: Group) => group.sheetName ?? 'foglio non trovato'
const extension = (path: string) => path.slice(path.lastIndexOf('.')).toLowerCase()
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

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

function totals(groups: Group[]) {
  return {
    jobs: groups.filter(group => group.jobId).length,
    files: groups.reduce((total, group) => total + group.fileCount, 0),
    size: groups.reduce((total, group) => total + group.totalSize, 0),
    lastModified: groups.reduce((last, group) => group.lastModified > last ? group.lastModified : last, ''),
  }
}

function jobLabel(group: Group) {
  if (!group.jobId) return `${JOB_LABELS[group.kind] ?? group.kind}: file senza lavoro`
  const date = myTimestamp(group.timestamp ?? group.lastModified)
  return group.jobExists ? date : `${JOB_LABELS[group.kind] ?? group.kind} del ${date}`
}

function Badge({ tone, children }: { tone: 'green' | 'yellow' | 'red' | 'gray', children: ReactNode }) {
  const colors = {
    green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800', gray: 'bg-gray-100 text-gray-800',
  }
  return <span className={`px-2 py-0.5 rounded text-sm whitespace-nowrap ${colors[tone]}`}>{children}</span>
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const tone = status === 'completed' ? 'green' : status === 'error' ? 'red'
    : status === 'processing' || status === 'pending' ? 'yellow' : 'gray'
  return <Badge tone={tone}>{STATUS_LABELS[status] ?? status}</Badge>
}

function FolderBadge({ folder }: { folder: string }) {
  const tone = folder === 'aborted' ? 'red' : ['queued', 'staging', 'processing'].includes(folder) ? 'yellow' : 'gray'
  return <Badge tone={tone}>{FOLDER_LABELS[folder] ?? folder}</Badge>
}

function DeletionReport({ report, areas, onClose }: { report: Deletion, areas: Area[], onClose: () => void }) {
  const areaLabels = new Map(areas.map(area => [area.area, area.label]))
  const reasons = [...new Set(report.failed.map(failure => failure.reason))]
  return <div role="status" className={`my-2 p-2 border rounded ${report.failed.length ? 'border-red-600' : 'border-green-600'}`}>
    <p>
      {pluralize(report.deleted, 'file cancellato', 'file cancellati')}
      {report.failed.length > 0 && <>; <b>{pluralize(report.failed.length, 'file non cancellato', 'file non cancellati')}</b></>}.
      {} <Button variant="secondary" onClick={onClose}>chiudi</Button>
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

// Una voce di una cartella: un'altra cartella oppure un lavoro.
type Entry = { key: string, label: string, href: string, groups: Group[], info?: ReactNode }

function EntryList({ entries, busy, onDelete }: {
  entries: Entry[], busy: boolean, onDelete: (groups: Group[]) => Promise<boolean>,
}) {
  const [selected, setSelected] = useState<string[]>([])
  if (entries.length === 0) return <p className="my-2 text-gray-500">Cartella vuota.</p>
  const selectedEntries = entries.filter(entry => selected.includes(entry.key))
  const all = totals(entries.flatMap(entry => entry.groups))
  const chosen = totals(selectedEntries.flatMap(entry => entry.groups))

  async function remove(targets: Entry[]) {
    await onDelete(targets.flatMap(entry => entry.groups))
    setSelected([])
  }

  return <>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" aria-label="Seleziona tutto"
              checked={selectedEntries.length === entries.length}
              onChange={e => setSelected(e.target.checked ? entries.map(entry => entry.key) : [])} />
          </th>
          <th className="text-left">nome</th><th></th><th>file</th><th>dimensione</th><th>ultima modifica</th><th></th>
        </tr>
      </thead>
      <tbody>
        {entries.map(entry => {
          const sum = totals(entry.groups)
          return <tr key={entry.key}>
            <td>
              <input type="checkbox" aria-label={`Seleziona ${entry.label}`}
                checked={selected.includes(entry.key)}
                onChange={e => setSelected(list => e.target.checked
                  ? [...list, entry.key] : list.filter(key => key !== entry.key))} />
            </td>
            <td>
              <Link href={entry.href} className="text-blue-600 hover:underline">📁 {entry.label}</Link>
            </td>
            <td>{entry.info ?? (sum.jobs > 0 && pluralize(sum.jobs, 'lavoro', 'lavori'))}</td>
            <td className="text-right">{sum.files}</td>
            <td className="text-right">{formatSize(sum.size)}</td>
            <td>{myTimestamp(sum.lastModified)}</td>
            <td>
              <Button variant="danger" disabled={busy} onClick={() => remove([entry])}>elimina</Button>
            </td>
          </tr>
        })}
      </tbody>
    </table>
    <div className="my-2 flex flex-wrap items-center gap-4">
      <span>
        {pluralize(entries.length, 'elemento', 'elementi')}, {pluralize(all.files, 'file', 'file')}, {formatSize(all.size)}
      </span>
      <Button variant="danger" disabled={selectedEntries.length === 0 || busy} onClick={() => remove(selectedEntries)}>
        Elimina selezionati{selectedEntries.length > 0 && ` (${pluralize(chosen.files, 'file', 'file')}, ${formatSize(chosen.size)})`}
      </Button>
    </div>
  </>
}

// Header breadcrumb of the page; the folders follow it.
const ROOT_CRUMB = { label: 'file', title: 'file dei worker' }

export default function WorkerFiles() {
  const profile = useProfile()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, error, loading, refetch } = useQuery<{ workerFiles: { areas: Area[], groups: Group[] } }>(WORKER_FILES, {
    fetchPolicy: 'network-only', skip: !profile?.isAdmin,
  })
  const [deleteGroup, deleteGroupState] = useMutation(DELETE_GROUP)
  const [report, setReport] = useState<Deletion | null>(null)

  // The root alone in the header until the files are loaded.
  const withRoot = (content: ReactNode) => <><HeaderBreadcrumbs breadcrumbs={[ROOT_CRUMB]} />{content}</>
  if (profile === undefined) return withRoot(<Loading />)
  if (!profile?.isAdmin) return withRoot(<p>Pagina riservata agli amministratori.</p>)
  if (error) return withRoot(<ErrorElement error={error} />)
  if (loading || !data) return withRoot(<Loading />)

  const { areas, groups } = data.workerFiles
  const place: Place = {}
  for (const key of PLACE_KEYS) place[key] = searchParams.get(key) || undefined
  const href = (target: Place) => {
    const params = new URLSearchParams()
    for (const key of PLACE_KEYS) if (target[key]) params.set(key, target[key]!)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  // gruppi contenuti nella posizione corrente
  let scope = groups
  if (place.kind === ORPHANS) scope = scope.filter(group => !group.jobExists)
  else if (place.kind) scope = scope.filter(group => group.jobExists && group.kind === place.kind)
  if (place.workbook) scope = scope.filter(group => workbookKey(group) === place.workbook)
  if (place.sheet) scope = scope.filter(group => sheetKey(group) === place.sheet)
  const job = place.job ? scope.find(group => groupKey(group) === place.job) : undefined

  const crumbs: { label: string, title?: string, place: Place }[] = [{ ...ROOT_CRUMB, place: {} }]
  if (place.kind) crumbs.push({ label: KIND_LABELS[place.kind] ?? place.kind, place: { kind: place.kind } })
  if (place.workbook) crumbs.push({ label: scope[0] ? workbookLabel(scope[0]) : 'raccoglitore',
    place: { kind: place.kind, workbook: place.workbook } })
  if (place.sheet) crumbs.push({ label: scope[0] ? sheetLabel(scope[0]) : 'foglio',
    place: { kind: place.kind, workbook: place.workbook, sheet: place.sheet } })
  if (place.job) crumbs.push({ label: job ? jobLabel(job) : 'lavoro', place })
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2].place : {}

  // restituisce false se l'utente non conferma
  async function removeGroups(targets: Group[]): Promise<boolean> {
    const { files, size } = totals(targets)
    const warning = targets.some(group => group.folders.includes('processing')) ? PROCESSING_WARNING : ''
    if (!window.confirm(`${warning}Cancellare ${pluralize(files, 'file', 'file')} (${formatSize(size)}) di `
      + `${pluralize(targets.length, 'lavoro', 'lavori')}? I lavori nel database non vengono modificati.`)) return false
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
    await refetch()
    return true
  }

  // voci della cartella corrente
  const folder = (key: string, label: string, target: Place, members: Group[], info?: ReactNode): Entry =>
    ({ key, label, href: href(target), groups: members, info })
  const jobEntry = (group: Group): Entry => folder(groupKey(group), jobLabel(group), { ...place, job: groupKey(group) },
    [group], <StatusBadge status={group.status} />)
  const byKey = (key: (group: Group) => string) => {
    const map = new Map<string, Group[]>()
    for (const group of scope) map.set(key(group), [...map.get(key(group)) ?? [], group])
    return [...map.entries()]
  }
  const bySize = (a: Entry, b: Entry) => totals(b.groups).size - totals(a.groups).size
  const byDate = (a: Entry, b: Entry) => totals(b.groups).lastModified.localeCompare(totals(a.groups).lastModified)

  let entries: Entry[] = []
  if (!place.kind) {
    entries = [
      folder('scan', KIND_LABELS.scan, { kind: 'scan' }, groups.filter(group => group.jobExists && group.kind === 'scan')),
      folder('sheet', KIND_LABELS.sheet, { kind: 'sheet' }, groups.filter(group => group.jobExists && group.kind === 'sheet')),
      folder(ORPHANS, KIND_LABELS[ORPHANS], { kind: ORPHANS }, groups.filter(group => !group.jobExists),
        <span className="text-gray-600">lavori eliminati dal database e file senza lavoro</span>),
    ]
  } else if (place.kind === ORPHANS || place.sheet) {
    entries = scope.map(jobEntry).sort(byDate)
  } else if (place.workbook) {
    entries = byKey(sheetKey).map(([key, members]) =>
      folder(key, sheetLabel(members[0]), { ...place, sheet: key }, members)).sort(bySize)
  } else {
    entries = byKey(workbookKey).map(([key, members]) =>
      folder(key, workbookLabel(members[0]), { ...place, workbook: key }, members)).sort(bySize)
  }

  return <div className="mx-2">
    <HeaderBreadcrumbs breadcrumbs={crumbs.map(({ label, title, place }, i): Breadcrumb =>
      ({ label, title, href: i < crumbs.length - 1 ? href(place) : undefined }))} />
    <div className="my-2"><Button onClick={async () => { await refetch() }}>Aggiorna</Button></div>
    {areas.filter(area => !area.available).map(area =>
      <p key={area.area} className="text-red-600">{area.label}: directory non disponibile</p>)}
    {deleteGroupState.error && <ErrorElement error={deleteGroupState.error} />}
    {report && <DeletionReport report={report} areas={areas} onClose={() => setReport(null)} />}

    {!place.kind && <div className="my-2">
      <p>
        File condivisi con i worker <b>oliscan</b> e <b>olisheet</b> di archiomr, ordinati per raccoglitore,
        foglio e lavoro. La cancellazione elimina solo i file: scansioni e fogli generati restano nel database,
        ma immagini e PDF cancellati non saranno più visibili.
      </p>
      <details>
        <summary>directory condivise</summary>
        <ul>{areas.map(area => <li key={area.area}>{area.label}</li>)}</ul>
      </details>
    </div>}

    {place.job
      ? job
        ? <JobFiles key={place.job} group={job} areas={areas} busy={deleteGroupState.loading}
            onDeleteAll={async () => { if (await removeGroups([job])) router.push(href(parent)) }}
            onDeleted={async deletion => { setReport(deletion); await refetch() }} />
        : <p className="my-2">
            Questo lavoro non ha più file. {}
            <Link href={href(parent)} className="text-blue-600 underline">Torna indietro</Link>
          </p>
      : <EntryList key={JSON.stringify(place)} entries={entries} busy={deleteGroupState.loading} onDelete={removeGroups} />}
  </div>
}

function JobFiles({ group, areas, busy, onDeleteAll, onDeleted }: {
  group: Group, areas: Area[], busy: boolean,
  onDeleteAll: () => Promise<void>, onDeleted: (deletion: Deletion) => Promise<void>,
}) {
  const { data, error, loading, refetch } = useQuery<{ workerFileGroupFiles: File[] }>(GROUP_FILES, {
    variables: { kind: group.kind, jobId: group.jobId }, fetchPolicy: 'network-only',
  })
  const [deleteFiles, deleteState] = useMutation(DELETE_FILES)
  const [selected, setSelected] = useState<string[]>([])
  const [previews, setPreviews] = useState(false)
  if (error) return <ErrorElement error={error} />
  if (loading || !data) return <Loading />
  const areaLabels = new Map(areas.map(area => [area.area, area.label]))
  const files = data.workerFileGroupFiles
  const fileKey = (file: File) => `${file.area}/${file.path}`
  const selectedFiles = files.filter(file => selected.includes(fileKey(file)))
  const hasImages = files.some(file => IMAGE_EXTENSIONS.includes(extension(file.path)))

  async function remove(targets: File[]) {
    const warning = targets.some(file => file.folder === 'processing') ? PROCESSING_WARNING : ''
    const what = targets.length === 1 ? basename(targets[0].path) : pluralize(targets.length, 'file', 'file')
    if (!window.confirm(`${warning}Cancellare ${what}?`)) return
    const result = await deleteFiles({ variables: { files: targets.map(({ area, path }) => ({ area, path })) } })
    setSelected([])
    await refetch()
    if (result.data) await onDeleted(result.data.deleteWorkerFiles)
  }

  return <>
    <div className="my-2 flex flex-wrap items-center gap-4">
      <span>{JOB_LABELS[group.kind] ?? group.kind}</span>
      <StatusBadge status={group.status} />
      {group.jobId && <code className="text-gray-600">{group.jobId}</code>}
      {!group.jobExists && group.jobId && <i>lavoro non presente nel database</i>}
      {group.sheetId && group.sheetName &&
        <Link href={`/sheet/${group.sheetId}`} className="text-blue-600 underline">apri il foglio</Link>}
      <Button variant="danger" disabled={busy || deleteState.loading} onClick={onDeleteAll}>
        Elimina tutti i file del lavoro
      </Button>
    </div>
    {deleteState.error && <ErrorElement error={deleteState.error} />}
    {hasImages && <label className="my-2 block">
      <input type="checkbox" checked={previews} onChange={e => setPreviews(e.target.checked)} /> mostra le anteprime delle immagini
    </label>}
    {files.length === 0
      ? <p>Nessun file.</p>
      : <table className="w-full">
        <thead>
          <tr>
            <th>
              <input type="checkbox" aria-label="Seleziona tutti i file"
                checked={selectedFiles.length === files.length}
                onChange={e => setSelected(e.target.checked ? files.map(fileKey) : [])} />
            </th>
            <th className="text-left">file</th><th>fase</th><th>dimensione</th><th>modifica</th><th></th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => {
            const isImage = IMAGE_EXTENSIONS.includes(extension(file.path))
            return <tr key={fileKey(file)}>
              <td>
                <input type="checkbox" aria-label={`Seleziona ${file.path}`}
                  checked={selected.includes(fileKey(file))}
                  onChange={e => setSelected(list => e.target.checked
                    ? [...list, fileKey(file)] : list.filter(key => key !== fileKey(file)))} />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  {previews && isImage && <a href={fileUrl(file, false)} target="_blank" rel="noopener noreferrer">
                    <Image src={fileUrl(file, false)} alt="" width={48} height={64} unoptimized
                      className="h-16 w-auto border" />
                  </a>}
                  <div>
                    <a href={fileUrl(file, false)} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline" title={file.path}>
                      {isImage ? '🖼️' : extension(file.path) === '.pdf' ? '📄' : '📝'} {basename(file.path)}
                    </a>
                    <div className="text-sm text-gray-500">{areaLabels.get(file.area) ?? file.area}</div>
                  </div>
                </div>
              </td>
              <td><FolderBadge folder={file.folder} /></td>
              <td className="text-right">{formatSize(file.size)}</td>
              <td>{myTimestamp(file.modifiedAt)}</td>
              <td className="whitespace-nowrap">
                <a href={fileUrl(file, true)} className="text-blue-600 underline mr-2">scarica</a>
                <Button variant="danger" disabled={deleteState.loading} onClick={() => remove([file])}>
                  elimina
                </Button>
              </td>
            </tr>
          })}
        </tbody>
      </table>}
    {files.length > 0 && <div className="my-2">
      <Button variant="danger" disabled={selectedFiles.length === 0 || deleteState.loading}
        onClick={() => remove(selectedFiles)}>
        Elimina i file selezionati
      </Button>
    </div>}
  </>
}
