'use client'

import { useEffect, useRef, useState } from 'react'
import { gql, useApolloClient, useQuery, useSubscription } from '@apollo/client'
import { Cog, X } from 'lucide-react'
import OlimanagerJobStatus from './OlimanagerJobStatus'

const JOBS_UPDATED = gql`
  subscription OlimanagerJobsUpdated { olimanagerJobsUpdated }
`
const ACTIVE_JOBS = gql`
  query BackgroundJobsStatus { olimanagerActiveJobs }
`

export default function BackgroundOperations() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  const [unread, setUnread] = useState(false)
  const client = useApolloClient()
  const jobs = useQuery<{ olimanagerActiveJobs: number }>(ACTIVE_JOBS, { fetchPolicy: 'network-only' })
  const activeJobs = jobs.data?.olimanagerActiveJobs ?? 0
  const label = activeJobs > 0
    ? `Operazioni in background (${activeJobs} in corso)`
    : 'Operazioni in background'
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
  }, [])
  const subscription = useSubscription<{ olimanagerJobsUpdated: boolean }>(JOBS_UPDATED, {
    onData: ({ data }) => {
      if (data.data?.olimanagerJobsUpdated && !dialog.current?.open) setUnread(true)
      if (refreshTimer.current === null) refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        const include = [...client.getObservableQueries('active').values()]
          .filter(query => query.queryName && ['BackgroundJobsStatus', 'OlimanagerJobs', 'OlimanagerJobItems', 'GetRows', 'GetSheets', 'getSheet'].includes(query.queryName))
          .map(query => query.options.query)
        void client.refetchQueries({ include }).catch(() => {
          // Query components display their own errors and offer manual refresh.
        })
      }, 500)
    },
  })

  return <>
    <button type="button" className="relative cursor-pointer border-0 bg-transparent p-1 text-gray-700 hover:text-blue-500 hide-print"
      title={label} aria-label={label}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => {
        setUnread(false)
        setOpen(true)
        dialog.current?.showModal()
      }}>
      <Cog size={22} aria-hidden="true"
        className={activeJobs > 0 ? 'text-blue-600 motion-safe:animate-spin motion-safe:[animation-duration:3s]' : undefined} />
      {unread && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />}
      <span className="sr-only" role="status">{unread ? 'Nuovi aggiornamenti dei lavori in background' : ''}</span>
    </button>
    <dialog ref={dialog} aria-labelledby="background-operations-title"
      className="fixed left-auto right-4 top-16 m-0 max-h-[80vh] w-[48rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-white p-4 text-gray-900 shadow-xl backdrop:bg-black/20"
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
      }}
      onClose={() => setOpen(false)}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="background-operations-title" className="text-lg font-semibold">Operazioni in background</h2>
        <button type="button" className="rounded p-2 hover:bg-gray-100"
          aria-label="Chiudi operazioni in background" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {open && <>
        {subscription.error && <p role="status">Notifiche in tempo reale non disponibili. Puoi usare Aggiorna stato.</p>}
        <OlimanagerJobStatus />
      </>}
    </dialog>
  </>
}
