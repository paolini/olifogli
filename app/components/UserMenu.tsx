'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { ChevronDown } from 'lucide-react'

const itemClass = 'block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 hover:text-blue-600'

/*
 * Navigation disclosure opened by the user's email: a button with
 * aria-expanded and a list of links, closed by an outside click, Escape or
 * choosing an item.
 */
export default function UserMenu({ email, isAdmin, isSupervisor }: {
  email: string, isAdmin: boolean, isSupervisor: boolean,
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return <div ref={container} className="relative hide-print">
    <button ref={button} type="button" aria-expanded={open} aria-controls="user-menu"
      className="flex max-w-[16rem] cursor-pointer items-center gap-1 border-0 bg-transparent p-1 italic text-gray-700 hover:text-blue-500"
      title={email} onClick={() => setOpen(value => !value)}>
      <span className="truncate">{email}</span>
      <ChevronDown size={16} aria-hidden="true" className={open ? 'rotate-180' : undefined} />
    </button>
    {open && <ul id="user-menu"
      className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded border bg-white py-1 shadow-lg">
      {(isAdmin || isSupervisor) && <li><Link href="/users" className={itemClass} onClick={close}>utenti</Link></li>}
      {isAdmin && <li><Link href="/files" className={itemClass} onClick={close}>file</Link></li>}
      {isAdmin && <li><Link href="/logs" className={itemClass} onClick={close}>logs</Link></li>}
      {isAdmin && <li><Link href="/rubrica" className={itemClass} onClick={close}>rubrica</Link></li>}
      <li className={isAdmin || isSupervisor ? 'mt-1 border-t pt-1' : undefined}>
        <button type="button" className={`${itemClass} cursor-pointer border-0 bg-transparent`}
          onClick={() => { close(); void signOut() }}>
          logout
        </button>
      </li>
    </ul>}
  </div>
}
