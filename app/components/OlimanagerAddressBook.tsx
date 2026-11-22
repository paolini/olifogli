'use client'
import { gql } from '@apollo/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOlimanagerVenueSheetChoicesQuery, useOlimanagerAddressBookLazyQuery, useOlimanagerAddressBookSelectionQuery } from '../graphql/generated'
import Link from 'next/link'
import { Archive, Lock, Unlock } from 'lucide-react'
import { ADDRESS_BOOK_ROLES, addressBookEntries, entryCsvRows, entryEmails, filterEntries, type AddressBookEntry, type AddressBookRole, type Sheet } from '../lib/addressBookEntries'
import { unparseCsv } from '../lib/csv'
import useProfile from '../lib/useProfile'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'

const ADDRESS_BOOK = gql`
    query OlimanagerAddressBook($olympiadId: String!, $editionId: String!) {
        olimanagerAddressBook(olympiadId: $olympiadId, editionId: $editionId) {
            districts {
                id name
                coordinators { name surname email }
                admins { name surname email }
                sheets { _id name label nRows nValidRows closed locked }
                schools { code name city province contact { name surname email } sheets { _id name label nRows nValidRows closed locked } }
            }
            warnings
        }
    }
`

const SELECTION = gql`
    query OlimanagerAddressBookSelection {
        olimanagerAddressBookSelection { olympiadId editionId }
    }
`

const ROLE_LABELS: Record<AddressBookRole, string> = {
    CD: 'coordinatori distrettuali',
    RD: 'responsabili di distretto',
    RI: 'referenti di istituto',
}

function Person({ entry }: { entry: AddressBookEntry }) {
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
function SheetLinks({ sheets }: { sheets: Sheet[] }) {
    return <>{sheets.map((sheet, i) => <span key={String(sheet._id)} className="whitespace-nowrap">
        {i > 0 && ', '}
        <SheetState sheet={sheet} />{' '}
        <Link className="text-blue-600 hover:underline" href={`/sheet/${sheet._id}`} title={sheet.name}>{sheet.label}</Link>
        {' '}<span title="righe valide / righe">{sheet.nValidRows}/{sheet.nRows}</span>
    </span>)}</>
}

export default function OlimanagerAddressBook() {
    const profile = useProfile()
    const choices = useOlimanagerVenueSheetChoicesQuery({ skip: !profile })
    const selection = useOlimanagerAddressBookSelectionQuery({ skip: !profile, fetchPolicy: 'network-only' })
    const [load, addressBook] = useOlimanagerAddressBookLazyQuery({ fetchPolicy: 'network-only' })
    type Selection = { olympiadId: string, editionId: string }
    // Until the user picks something, the selection is the last edition consulted, if Olimanager still lists it.
    const [picked, setPicked] = useState<Selection | null>(null)
    const saved = useMemo(() => {
        const last = selection.data?.olimanagerAddressBookSelection
        return last && choices.data?.olimanagerVenueSheetChoices.find(o => o.id === last.olympiadId)?.editions.some(e => e.id === last.editionId)
            ? { olympiadId: last.olympiadId, editionId: last.editionId } : null
    }, [selection.data, choices.data])
    const { olympiadId, editionId } = picked || saved || { olympiadId: '', editionId: '' }
    const [roles, setRoles] = useState<Set<AddressBookRole>>(new Set(ADDRESS_BOOK_ROLES))
    const [search, setSearch] = useState('')
    const [copied, setCopied] = useState('')
    // Once an edition is loaded (or loading) the selects are hidden until «Cambia edizione».
    const [changing, setChanging] = useState(false)

    const districts = addressBook.data?.olimanagerAddressBook.districts
    const entries = useMemo(() => addressBookEntries(districts || []), [districts])
    const filtered = useMemo(() => filterEntries(entries, roles, search), [entries, roles, search])
    const emails = entryEmails(filtered)

    // Load the saved edition as soon as it is known, once.
    const restored = useRef(false)
    useEffect(() => {
        if (restored.current || !saved) return
        restored.current = true
        void load({ variables: saved })
    }, [saved, load])

    if (!profile) return <Loading />
    if (choices.loading || selection.loading) return <Loading />

    const olympiads = choices.data?.olimanagerVenueSheetChoices || []
    const editions = olympiads.find(o => o.id === olympiadId)?.editions || []
    const warnings = addressBook.data?.olimanagerAddressBook.warnings || []
    const current = addressBook.loading || addressBook.data ? addressBook.variables : undefined
    const currentEdition = olympiads.find(o => o.id === current?.olympiadId)?.editions.find(e => e.id === current?.editionId)
    const showSelects = changing || !currentEdition
    const editionLabel = (e: { name: string, year?: number | null }) => `${e.name}${e.year ? ` (${e.year})` : ''}`
    const byDistrict = Map.groupBy(filtered, e => e.district)
    // For other users a school without links may just be a sheet they cannot access.
    const seesAllSheets = profile.isAdmin || profile.isSupervisor
    const hasSheets = (districts || []).some(d => d.sheets.length || d.schools.some(s => s.sheets.length))
    const shown = (districts || []).filter(d => byDistrict.has(d.name))

    function toggleRole(role: AddressBookRole) {
        setRoles(prev => {
            const next = new Set(prev)
            if (next.has(role)) next.delete(role); else next.add(role)
            return next
        })
    }

    async function copyEmails() {
        try {
            await navigator.clipboard.writeText(emails.join(', '))
            setCopied(`${emails.length} email copiate negli appunti.`)
        } catch {
            setCopied('Copia negli appunti non riuscita.')
        }
    }

    function downloadCsv() {
        const blob = new Blob([unparseCsv(entryCsvRows(filtered))], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'rubrica.csv'
        link.click()
        URL.revokeObjectURL(link.href)
    }

    return <div className="space-y-3">
        <h1 className="text-xl font-bold">Rubrica di CD, RD e RI</h1>
        <p>Coordinatori distrettuali (CD), responsabili di distretto (RD) e referenti di istituto (RI) delle scuole con iscrizione valida all’edizione, letti da Olimanager: compaiono solo i contatti che Olimanager ti permette di vedere, e solo i fogli a cui hai accesso.</p>
        <Error error={choices.error || selection.error || addressBook.error} />
        {!showSelects && <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold">{editionLabel(currentEdition)}</h2>
            <Button variant="secondary" onClick={() => setChanging(true)}>Cambia edizione</Button>
        </div>}
        {showSelects && <div className="flex flex-wrap items-center gap-3">
            <label>Olimpiade <select value={olympiadId} onChange={e => setPicked({ olympiadId: e.target.value, editionId: '' })}>
                <option value="">Seleziona olimpiade</option>
                {olympiads.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>
            <label>Edizione <select disabled={!olympiadId} value={editionId} onChange={e => setPicked({ olympiadId, editionId: e.target.value })}>
                <option value="">Seleziona edizione</option>
                {editions.map(e => <option key={e.id} value={e.id}>{editionLabel(e)}</option>)}
            </select></label>
            <Button disabled={!olympiadId || !editionId || addressBook.loading} onClick={async () => {
                setCopied('')
                setChanging(false)
                await load({ variables: { olympiadId, editionId } })
            }}>Carica rubrica</Button>
            {changing && currentEdition && <Button variant="secondary" onClick={() => {
                setPicked(current ?? null)
                setChanging(false)
            }}>Annulla</Button>}
        </div>}
        {addressBook.loading && <Loading />}
        {districts && !addressBook.loading && <>
            <div className="flex flex-wrap items-center gap-3">
                <input type="search" className="border px-1" placeholder="Cerca nome, email, scuola, città…" value={search} onChange={e => setSearch(e.target.value)} />
                {ADDRESS_BOOK_ROLES.map(role => <label key={role} title={ROLE_LABELS[role]}>
                    <input type="checkbox" checked={roles.has(role)} onChange={() => toggleRole(role)} /> {role}
                </label>)}
                <span>{filtered.length} voci, {emails.length} email</span>
                <Button variant="secondary" disabled={!emails.length} onClick={copyEmails}>Copia email</Button>
                <Button variant="secondary" disabled={!filtered.length} onClick={downloadCsv}>Scarica CSV</Button>
                {copied && <span>{copied}</span>}
            </div>
            {!hasSheets && <p>Nessun foglio Olifogli {seesAllSheets ? '' : 'a cui hai accesso '}per i contest di questa edizione.</p>}
            {warnings.length > 0 && <details>
                <summary className="cursor-pointer">{warnings.length} avvisi</summary>
                <ul className="list-disc pl-6">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>}
            {shown.map(district => {
                const items = byDistrict.get(district.name) || []
                const coordinators = items.filter(e => e.role === 'CD')
                const admins = items.filter(e => e.role === 'RD')
                const schools = items.filter(e => e.role === 'RI')
                return <section key={district.id ?? district.name} className="rounded border p-2">
                    <h2 className="text-lg font-bold">{district.name}</h2>
                    {district.sheets.length > 0 && <p><b>Fogli:</b> <SheetLinks sheets={district.sheets} /></p>}
                    {coordinators.length > 0 && <p><b>CD:</b> {coordinators.map((e, i) => <span key={i}>{i > 0 && ', '}<Person entry={e} /></span>)}</p>}
                    {admins.length > 0 && <p><b>RD:</b> {admins.map((e, i) => <span key={i}>{i > 0 && ', '}<Person entry={e} /></span>)}</p>}
                    {schools.length > 0 && <table className="mt-1">
                        <thead><tr>
                            <th className="text-left">codice</th><th className="text-left">scuola</th>
                            <th className="text-left">città</th><th className="text-left">RI</th><th className="text-left">fogli</th>
                        </tr></thead>
                        <tbody>{schools.map((e, i) => <tr key={i}>
                            <td className="pr-3 font-mono">{e.code}</td>
                            <td className="pr-3">{e.school}</td>
                            <td className="pr-3">{e.city}{e.province ? ` (${e.province})` : ''}</td>
                            <td className="pr-3"><Person entry={e} /></td>
                            <td>{e.sheets.length ? <SheetLinks sheets={e.sheets} /> : hasSheets && seesAllSheets && <span className="text-red-600">nessun foglio</span>}</td>
                        </tr>)}</tbody>
                    </table>}
                </section>
            })}
            {!districts.length && <p>Olimanager non ti mostra nessun contatto per questa edizione.</p>}
            {districts.length > 0 && !shown.length && <p>Nessuna voce corrisponde ai filtri.</p>}
        </>}
    </div>
}
