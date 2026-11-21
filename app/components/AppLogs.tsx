'use client'
import { useRef, useState } from 'react'
import { gql, useQuery, useSubscription } from '@apollo/client'

import Button from './Button'
import ErrorElement from './Error'
import Loading from './Loading'
import { logDiagnostic } from '../lib/logging'
import useProfile from '../lib/useProfile'

const ENTRY_FIELDS = 'timestamp level source event userId userEmail data'
const APP_LOGS = gql`
  query AppLogs($day: String, $limit: Int) {
    appLogs(day: $day, limit: $limit) {
      available days day truncated
      entries { ${ENTRY_FIELDS} }
    }
  }
`
const APP_LOG_ADDED = gql`
  subscription AppLogAdded {
    appLogAdded { ${ENTRY_FIELDS} }
  }
`

type Entry = {
  timestamp: string, level: string, source: string, event: string,
  userId: string | null, userEmail: string | null, data: Record<string, unknown>,
}

const PAGE = 500
const MAX_LIVE = 2000
const LEVEL_CLASSES: Record<string, string> = { error: 'bg-red-200', warn: 'bg-yellow-100' }

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined) return '—'
  return String(value)
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('it-IT')
}

export default function AppLogs() {
  const profile = useProfile()
  const [day, setDay] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [live, setLive] = useState<Entry[]>([])
  const [paused, setPausedState] = useState(false)
  // Read by the subscription callback, which may belong to an older render.
  const pausedRef = useRef(false)
  const setPaused = (value: boolean) => { pausedRef.current = value; setPausedState(value) }
  const pending = useRef<Entry[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [text, setText] = useState('')
  const [hideRequests, setHideRequests] = useState(false)

  const { data, error, loading, refetch } = useQuery<{ appLogs: {
    available: boolean, days: string[], day: string | null, truncated: boolean, entries: Entry[],
  } }>(APP_LOGS, {
    variables: { day, limit }, fetchPolicy: 'network-only', skip: !profile?.isAdmin,
  })
  const logs = data?.appLogs
  // New events belong to the most recent day only.
  // Without LOG_DIR there is no history, but live events still arrive.
  const following = !!logs && (!logs.available || !logs.day || logs.day === logs.days[0])
  const subscription = useSubscription<{ appLogAdded: Entry }>(APP_LOG_ADDED, {
    skip: !profile?.isAdmin || !following,
    onData: ({ data: result }) => {
      const entry = result.data?.appLogAdded
      if (!entry) return
      if (pausedRef.current) {
        pending.current.unshift(entry)
        setPendingCount(pending.current.length)
      } else {
        setLive(list => [entry, ...list].slice(0, MAX_LIVE))
      }
    },
    onError: error => logDiagnostic('app_logs.subscription_failed', error),
  })

  if (profile === undefined) return <Loading />
  if (!profile?.isAdmin) return <p>Pagina riservata agli amministratori.</p>
  if (error) return <ErrorElement error={error} />
  if (loading && !logs) return <Loading />
  if (!logs) return null

  function reset() {
    setLive([])
    pending.current = []
    setPendingCount(0)
  }

  function resume() {
    setLive(list => [...pending.current, ...list].slice(0, MAX_LIVE))
    pending.current = []
    setPendingCount(0)
    setPaused(false)
  }

  const entries = [...live, ...logs.entries]
  const sources = [...new Set(entries.map(entry => entry.source))].sort()
  const needle = text.trim().toLowerCase()
  const visible = entries.filter(entry => (!level || entry.level === level)
    && (!source || entry.source === source)
    && (!hideRequests || entry.event !== 'graphql.request')
    && (!needle || entry.event.toLowerCase().includes(needle) || (entry.userEmail ?? '').toLowerCase().includes(needle)))

  return <div className="mx-2">
    <h1>log applicativi</h1>

    {!logs.available && <p className="my-2 text-yellow-700">
      <code>LOG_DIR</code> non è configurata: la storia non è disponibile, ma i nuovi eventi compaiono qui sotto.
    </p>}

    <div className="my-2 flex flex-wrap items-center gap-4">
      {logs.days.length > 0 && <label>giorno (UTC) {}
        <select value={logs.day ?? ''} className="border rounded px-1"
          onChange={e => { reset(); setLimit(PAGE); setDay(e.target.value) }}>
          {logs.days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>}
      <label>livello {}
        <select value={level} onChange={e => setLevel(e.target.value)} className="border rounded px-1">
          <option value="">tutti</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </label>
      <label>processo {}
        <select value={source} onChange={e => setSource(e.target.value)} className="border rounded px-1">
          <option value="">tutti</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>cerca {}
        <input value={text} onChange={e => setText(e.target.value)} placeholder="evento o email"
          className="border rounded px-1" />
      </label>
      <label>
        <input type="checkbox" checked={hideRequests} onChange={e => setHideRequests(e.target.checked)} /> nascondi
        richieste GraphQL
      </label>
      <Button onClick={async () => { reset(); await refetch() }}>Aggiorna</Button>
    </div>

    <p className="my-2" role="status">
      {following
        ? subscription.error
          ? <span className="text-red-700">Aggiornamento in tempo reale non disponibile.</span>
          : paused
            ? <>In pausa{pendingCount > 0 ? `: ${pendingCount} nuovi eventi` : ''}. {}
              <Button onClick={resume}>riprendi</Button></>
            : <>In tempo reale. {}
              <Button onClick={() => setPaused(true)}>pausa</Button></>
        : 'Giorno passato: nessun aggiornamento in tempo reale.'}
      {' '}{visible.length} di {entries.length} eventi mostrati.
    </p>

    {visible.length > 0 && <table className="w-full">
      <thead>
        <tr><th>ora</th><th>utente</th><th>evento</th><th>dettagli</th></tr>
      </thead>
      <tbody>
        {visible.map((entry, index) => <tr key={`${entry.timestamp}-${entry.event}-${index}`}
          className={LEVEL_CLASSES[entry.level] ?? ''} title={`${entry.level} · ${entry.source}`}>
          <td className="whitespace-nowrap">{formatTime(entry.timestamp)}</td>
          <td>{entry.userEmail ?? (entry.userId ? <code title="utente non più presente">{entry.userId}</code> : '')}</td>
          <td><code>{entry.event}</code></td>
          <td className="text-sm">
            {Object.entries(entry.data ?? {}).map(([key, value]) => <span key={key} className="mr-3">
              <span className="text-gray-500">{key}</span>={formatValue(value)}
            </span>)}
          </td>
        </tr>)}
      </tbody>
    </table>}

    {logs.truncated && <div className="my-2">
      {/* The reloaded page includes the events received live so far. */}
      <Button disabled={loading} onClick={() => { reset(); setLimit(value => value + PAGE) }}>Carica eventi precedenti</Button>
    </div>}
  </div>
}
