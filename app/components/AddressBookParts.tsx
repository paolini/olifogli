'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Archive, Lock, Unlock } from 'lucide-react'
import { ADDRESS_BOOK_ROLES, entryCsvRows, entryEmails, type AddressBookEntry, type AddressBookRole, type Sheet } from '../lib/addressBookEntries'
import { unparseCsv } from '../lib/csv'
import Button from './Button'

// Pieces shared by the district list and the district page of the address book.

const ROLE_LABELS: Record<AddressBookRole, string> = {
    CD: 'coordinatori distrettuali',
    RD: 'responsabili di distretto',
    RI: 'referenti di istituto',
}

export function Person({ entry }: { entry: AddressBookEntry }) {
    const fullName = `${entry.surname} ${entry.name}`.trim()
    return <span>
        {fullName || <i>senza nome</i>}
        {entry.email ? <> &lt;<a className="text-blue-600 hover:underline" href={`mailto:${entry.email}`}>{entry.email}</a>&gt;</> : <i className="text-gray-500"> senza email</i>}
    </span>
}

// Same icons and colors as the state column of the sheet list (Sheets.tsx).
function SheetState({ sheet }: { sheet: Sheet }) {
    const [Icon, label, color] = sheet.locked ? [Lock, 'finalizzato', 'text-red-600']
        : sheet.closed ? [Archive, 'chiuso', 'text-orange-500'] : [Unlock, 'aperto', 'text-green-600']
    return <span title={label} role="img" aria-label={label} className="inline-flex align-text-bottom">
        <Icon size={14} className={color} aria-hidden="true" />
    </span>
}

// Link to a sheet with its state and valid/total rows.
export function SheetLinks({ sheets }: { sheets: Sheet[] }) {
    return <>{sheets.map((sheet, i) => <span key={String(sheet._id)} className="whitespace-nowrap">
        {i > 0 && ', '}
        <SheetState sheet={sheet} />{' '}
        <Link className="text-blue-600 hover:underline" href={`/sheet/${sheet._id}`} title={sheet.name}>{sheet.label}</Link>
        {' '}<span title="righe valide / righe">{sheet.nValidRows}/{sheet.nRows}</span>
    </span>)}</>
}

export function RoleFilter({ roles, setRoles }: { roles: Set<AddressBookRole>, setRoles: (roles: Set<AddressBookRole>) => void }) {
    function toggle(role: AddressBookRole) {
        const next = new Set(roles)
        if (next.has(role)) next.delete(role); else next.add(role)
        setRoles(next)
    }
    return <>{ADDRESS_BOOK_ROLES.map(role => <label key={role} title={ROLE_LABELS[role]}>
        <input type="checkbox" checked={roles.has(role)} onChange={() => toggle(role)} /> {role}
    </label>)}</>
}

// Email copy and CSV export of the given entries, with their counts.
export function BulkActions({ entries }: { entries: AddressBookEntry[] }) {
    const [copied, setCopied] = useState('')
    const emails = entryEmails(entries)

    async function copyEmails() {
        try {
            await navigator.clipboard.writeText(emails.join(', '))
            setCopied(`${emails.length} email copiate negli appunti.`)
        } catch {
            setCopied('Copia negli appunti non riuscita.')
        }
    }

    function downloadCsv() {
        const blob = new Blob([unparseCsv(entryCsvRows(entries))], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'rubrica.csv'
        link.click()
        URL.revokeObjectURL(link.href)
    }

    return <>
        <span>{entries.length} voci, {emails.length} email</span>
        <Button variant="secondary" disabled={!emails.length} onClick={copyEmails}>Copia email</Button>
        <Button variant="secondary" disabled={!entries.length} onClick={downloadCsv}>Scarica CSV</Button>
        {copied && <span>{copied}</span>}
    </>
}

export function Warnings({ warnings }: { warnings: string[] }) {
    if (!warnings.length) return null
    return <details>
        <summary className="cursor-pointer">{warnings.length} avvisi</summary>
        <ul className="list-disc pl-6">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </details>
}
