'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { addressBookEntries, districtKey, districtSummary, filterDistricts, filterEntries, type AddressBookRole, type District } from '../lib/addressBookEntries'
import { BulkActions, Person, RoleFilter, SheetLinks } from './AddressBookParts'

// Results of the people search shown at most; the bulk actions use them all.
const MAX_RESULTS = 200

const districtHref = (district: District) => `/rubrica?distretto=${encodeURIComponent(districtKey(district))}`

// First level of the address book: the districts, filtered by name, or the
// people and schools matching a separate search.
export default function AddressBookDistricts({ districts, roles, setRoles, districtFilter, setDistrictFilter, peopleSearch, setPeopleSearch }: {
    districts: District[]
    roles: Set<AddressBookRole>, setRoles: (roles: Set<AddressBookRole>) => void
    districtFilter: string, setDistrictFilter: (filter: string) => void
    peopleSearch: string, setPeopleSearch: (search: string) => void
}) {
    const shown = useMemo(() => filterDistricts(districts, districtFilter), [districts, districtFilter])
    const searching = peopleSearch.trim() !== ''
    // Bulk actions: the search results, or the chosen roles of the districts listed.
    const entries = useMemo(() => searching
        ? filterEntries(addressBookEntries(districts), roles, peopleSearch)
        : filterEntries(addressBookEntries(shown), roles, ''), [searching, districts, shown, roles, peopleSearch])
    const byName = new Map(districts.map(d => [d.name, d]))

    return <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
            <input type="search" className="border px-1" aria-label="Filtra distretti" placeholder="Filtra distretti…" disabled={searching}
                value={districtFilter} onChange={e => setDistrictFilter(e.target.value)} />
            <input type="search" className="border px-1" aria-label="Cerca persone o scuole" placeholder="Cerca persone o scuole…"
                value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} />
            <RoleFilter roles={roles} setRoles={setRoles} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <span>{searching ? 'Risultati della ricerca:' : `Ruoli scelti dei ${shown.length} distretti elencati:`}</span>
            <BulkActions entries={entries} />
        </div>
        {searching ? <>
            {entries.length > MAX_RESULTS && <p>Sono mostrati i primi {MAX_RESULTS} risultati su {entries.length}: affina la ricerca.</p>}
            {entries.length ? <table>
                <thead><tr>
                    <th className="text-left">ruolo</th><th className="text-left">persona</th>
                    <th className="text-left">scuola</th><th className="text-left">distretto</th><th className="text-left">fogli</th>
                </tr></thead>
                <tbody>{entries.slice(0, MAX_RESULTS).map((e, i) => {
                    const district = byName.get(e.district)
                    return <tr key={i}>
                        <td className="pr-3">{e.role}</td>
                        <td className="pr-3"><Person entry={e} /></td>
                        <td className="pr-3">{e.code && <span className="font-mono">{e.code}</span>} {e.school}{e.city ? `, ${e.city}` : ''}</td>
                        <td className="pr-3">{district ? <Link className="text-blue-600 hover:underline" href={districtHref(district)}>{e.district}</Link> : e.district}</td>
                        <td><SheetLinks sheets={e.sheets} /></td>
                    </tr>
                })}</tbody>
            </table> : <p>Nessuna persona o scuola corrisponde alla ricerca.</p>}
        </> : shown.length ? <table>
            <thead><tr>
                <th className="text-left">distretto</th><th className="text-left">CD</th>
                <th className="text-right" title="altri responsabili di distretto">RD</th>
                <th className="text-right" title="scuole con iscrizione valida">scuole</th>
                <th className="text-right" title="scuole con almeno un foglio">con foglio</th>
                <th className="text-right" title="righe valide / righe dei fogli del distretto e delle sue scuole">righe valide</th>
                <th className="text-right">avvisi</th>
                <th className="text-left" title="fogli dei contest distrettuali">fogli</th>
            </tr></thead>
            <tbody>{shown.map(district => {
                const summary = districtSummary(district)
                return <tr key={districtKey(district)}>
                    <td className="pr-3"><Link className="text-blue-600 hover:underline" href={districtHref(district)}>{district.name}</Link></td>
                    <td className="pr-3">{district.coordinators.map(c => `${c.surname} ${c.name}`.trim()).join(', ')}</td>
                    <td className="pr-3 text-right">{district.admins.length}</td>
                    <td className="pr-3 text-right">{summary.schools}</td>
                    <td className="pr-3 text-right">{summary.schoolsWithSheets}</td>
                    <td className="pr-3 text-right">{summary.validRows}/{summary.rows}</td>
                    <td className={`pr-3 text-right ${summary.warnings ? 'text-orange-600' : ''}`}>{summary.warnings || ''}</td>
                    <td><SheetLinks sheets={district.sheets || []} /></td>
                </tr>
            })}</tbody>
        </table> : <p>Nessun distretto corrisponde al filtro.</p>}
    </div>
}
