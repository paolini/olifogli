// Client-side helpers of the address book page: districts filtered by name,
// one entry per person and role filtered by role and free text (the people
// search, which ignores district names), the email list and the CSV export.

export type AddressBookRole = 'CD' | 'RD' | 'RI'
export const ADDRESS_BOOK_ROLES: AddressBookRole[] = ['CD', 'RD', 'RI']

type Contact = { name: string, surname: string, email?: string | null }
export type Sheet = { _id: unknown, name: string, label: string, nRows: number, nValidRows: number, closed: boolean, locked: boolean }
type School = { code: string, name: string, city: string, province: string, contact?: Contact | null, sheets?: Sheet[] }
export type District = { id?: number | null, name: string, coordinators: Contact[], admins: Contact[], schools: School[], sheets?: Sheet[], warnings?: string[] }

export type AddressBookEntry = {
    district: string, role: AddressBookRole, surname: string, name: string, email: string,
    code: string, school: string, city: string, province: string,
    sheets: Sheet[], // the school's sheets, for RI entries only
}

export function addressBookEntries(districts: District[]): AddressBookEntry[] {
    const entries: AddressBookEntry[] = []
    const noSchool = { code: '', school: '', city: '', province: '', sheets: [] }
    for (const district of districts) {
        const person = (role: AddressBookRole, c: Contact) => ({ district: district.name, role, surname: c.surname, name: c.name, email: c.email || '' })
        for (const c of district.coordinators) entries.push({ ...person('CD', c), ...noSchool })
        for (const c of district.admins) entries.push({ ...person('RD', c), ...noSchool })
        for (const s of district.schools) {
            entries.push({
                ...person('RI', s.contact || { name: '', surname: '' }),
                code: s.code, school: s.name, city: s.city, province: s.province, sheets: s.sheets || [],
            })
        }
    }
    return entries
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const wordsOf = (search: string) => normalize(search).split(/\s+/).filter(Boolean)

// URL value of a district (`?distretto=`); `none` for the unassigned schools.
export const districtKey = (district: { id?: number | null }) => district.id == null ? 'none' : String(district.id)

// Districts whose name contains every word of the filter.
export function filterDistricts<D extends District>(districts: D[], filter: string): D[] {
    const words = wordsOf(filter)
    return districts.filter(d => words.every(word => normalize(d.name).includes(word)))
}

// Counts shown in the district list.
export function districtSummary(district: District) {
    const sheets = [...(district.sheets || []), ...district.schools.flatMap(s => s.sheets || [])]
    return {
        schools: district.schools.length,
        schoolsWithSheets: district.schools.filter(s => s.sheets?.length).length,
        rows: sheets.reduce((n, s) => n + s.nRows, 0),
        validRows: sheets.reduce((n, s) => n + s.nValidRows, 0),
        warnings: district.warnings?.length || 0,
    }
}

// Every word of the search must appear in some field of the entry; the
// district name is left out, so that searching «Roma» finds people, not a district.
export function filterEntries(entries: AddressBookEntry[], roles: Set<AddressBookRole>, search: string) {
    const words = wordsOf(search)
    return entries.filter(entry => {
        if (!roles.has(entry.role)) return false
        const text = normalize([entry.role, entry.surname, entry.name, entry.email, entry.code, entry.school, entry.city, entry.province].join(' '))
        return words.every(word => text.includes(word))
    })
}

export function entryEmails(entries: AddressBookEntry[]) {
    return [...new Set(entries.map(e => e.email).filter(Boolean))]
}

export function entryCsvRows(entries: AddressBookEntry[]) {
    return entries.map(e => ({
        distretto: e.district, ruolo: e.role, cognome: e.surname, nome: e.name, email: e.email,
        codice_meccanografico: e.code, scuola: e.school, 'città': e.city, provincia: e.province,
        fogli: e.sheets.map(s => s.label).join(', '),
    }))
}
