'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { addressBookEntries, filterEntries, type AddressBookRole, type District } from '../lib/addressBookEntries'
import { BulkActions, Person, RoleFilter, SheetLinks, Warnings } from './AddressBookParts'

// Second level of the address book: the people and schools of one district.
export default function AddressBookDistrict({ district, roles, setRoles, showBack, markMissingSheets }: {
    district: District
    roles: Set<AddressBookRole>, setRoles: (roles: Set<AddressBookRole>) => void
    showBack: boolean // false when the user sees only this district
    markMissingSheets: boolean // «nessun foglio» is meaningful only for whoever sees all the sheets
}) {
    const [search, setSearch] = useState('')
    const entries = useMemo(() => filterEntries(addressBookEntries([district]), roles, search), [district, roles, search])
    const coordinators = entries.filter(e => e.role === 'CD')
    const admins = entries.filter(e => e.role === 'RD')
    const schools = entries.filter(e => e.role === 'RI')
    const people = (list: typeof entries) => list.map((e, i) => <span key={i}>{i > 0 && ', '}<Person entry={e} /></span>)

    return <div className="space-y-3">
        {showBack && <Link className="text-blue-600 hover:underline" href="/rubrica">← tutti i distretti</Link>}
        <h2 className="text-2xl font-bold">{district.name}</h2>
        {district.sheets?.length ? <p><b>Fogli:</b> <SheetLinks sheets={district.sheets} /></p> : null}
        <Warnings warnings={district.warnings || []} />
        <div className="flex flex-wrap items-center gap-3">
            <input type="search" className="border px-1" aria-label="Cerca nel distretto" placeholder="Cerca nome, email, scuola, città…"
                value={search} onChange={e => setSearch(e.target.value)} />
            <RoleFilter roles={roles} setRoles={setRoles} />
            <BulkActions entries={entries} />
        </div>
        {coordinators.length > 0 && <p><b>CD:</b> {people(coordinators)}</p>}
        {admins.length > 0 && <p><b>RD:</b> {people(admins)}</p>}
        {schools.length > 0 && <table>
            <thead><tr>
                <th className="text-left">codice</th><th className="text-left">scuola</th>
                <th className="text-left">città</th><th className="text-left">RI</th><th className="text-left">fogli</th>
            </tr></thead>
            <tbody>{schools.map((e, i) => <tr key={i}>
                <td className="pr-3 font-mono">{e.code}</td>
                <td className="pr-3">{e.school}</td>
                <td className="pr-3">{e.city}{e.province ? ` (${e.province})` : ''}</td>
                <td className="pr-3"><Person entry={e} /></td>
                <td>{e.sheets.length ? <SheetLinks sheets={e.sheets} /> : markMissingSheets && <span className="text-red-600">nessun foglio</span>}</td>
            </tr>)}</tbody>
        </table>}
        {!entries.length && <p>Nessuna voce corrisponde ai filtri.</p>}
    </div>
}
