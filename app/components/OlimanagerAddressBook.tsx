'use client'
import { gql } from '@apollo/client'
import { useMemo, useState } from 'react'
import { useOlimanagerVenueSheetChoicesQuery, useOlimanagerAddressBookLazyQuery } from '../graphql/generated'
import { ADDRESS_BOOK_ROLES, addressBookEntries, entryCsvRows, entryEmails, filterEntries, type AddressBookEntry, type AddressBookRole } from '../lib/addressBookEntries'
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
                schools { code name city province contact { name surname email } }
            }
            warnings
        }
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

export default function OlimanagerAddressBook() {
    const profile = useProfile()
    const choices = useOlimanagerVenueSheetChoicesQuery({ skip: !profile?.isAdmin })
    const [load, addressBook] = useOlimanagerAddressBookLazyQuery({ fetchPolicy: 'network-only' })
    const [olympiadId, setOlympiadId] = useState('')
    const [editionId, setEditionId] = useState('')
    const [roles, setRoles] = useState<Set<AddressBookRole>>(new Set(ADDRESS_BOOK_ROLES))
    const [search, setSearch] = useState('')
    const [copied, setCopied] = useState('')

    const districts = addressBook.data?.olimanagerAddressBook.districts
    const entries = useMemo(() => addressBookEntries(districts || []), [districts])
    const filtered = useMemo(() => filterEntries(entries, roles, search), [entries, roles, search])
    const emails = entryEmails(filtered)

    if (!profile) return <Loading />
    if (!profile.isAdmin) return <Error error="Pagina riservata agli amministratori." />
    if (choices.loading) return <Loading />

    const olympiads = choices.data?.olimanagerVenueSheetChoices || []
    const editions = olympiads.find(o => o.id === olympiadId)?.editions || []
    const warnings = addressBook.data?.olimanagerAddressBook.warnings || []
    const byDistrict = Map.groupBy(filtered, e => e.district)
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
        <p>Coordinatori distrettuali (CD), responsabili di distretto (RD) e referenti di istituto (RI) delle scuole con iscrizione valida all’edizione, letti da Olimanager.</p>
        <Error error={choices.error || addressBook.error} />
        <div className="flex flex-wrap items-center gap-3">
            <label>Olimpiade <select value={olympiadId} onChange={e => { setOlympiadId(e.target.value); setEditionId('') }}>
                <option value="">Seleziona olimpiade</option>
                {olympiads.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>
            <label>Edizione <select disabled={!olympiadId} value={editionId} onChange={e => setEditionId(e.target.value)}>
                <option value="">Seleziona edizione</option>
                {editions.map(e => <option key={e.id} value={e.id}>{e.name}{e.year ? ` (${e.year})` : ''}</option>)}
            </select></label>
            <Button disabled={!olympiadId || !editionId || addressBook.loading} onClick={async () => {
                setCopied('')
                await load({ variables: { olympiadId, editionId } })
            }}>Carica rubrica</Button>
        </div>
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
                    {coordinators.length > 0 && <p><b>CD:</b> {coordinators.map((e, i) => <span key={i}>{i > 0 && ', '}<Person entry={e} /></span>)}</p>}
                    {admins.length > 0 && <p><b>RD:</b> {admins.map((e, i) => <span key={i}>{i > 0 && ', '}<Person entry={e} /></span>)}</p>}
                    {schools.length > 0 && <table className="mt-1">
                        <thead><tr>
                            <th className="text-left">codice</th><th className="text-left">scuola</th>
                            <th className="text-left">città</th><th className="text-left">RI</th>
                        </tr></thead>
                        <tbody>{schools.map((e, i) => <tr key={i}>
                            <td className="pr-3 font-mono">{e.code}</td>
                            <td className="pr-3">{e.school}</td>
                            <td className="pr-3">{e.city}{e.province ? ` (${e.province})` : ''}</td>
                            <td><Person entry={e} /></td>
                        </tr>)}</tbody>
                    </table>}
                </section>
            })}
            {!shown.length && <p>Nessuna voce corrisponde ai filtri.</p>}
        </>}
    </div>
}
