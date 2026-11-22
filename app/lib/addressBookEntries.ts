// Client-side helpers of the address book page: one entry per person and role,
// filtered by role and free text, for the email list and the CSV export.

export type AddressBookRole = 'CD' | 'RD' | 'RI'
export const ADDRESS_BOOK_ROLES: AddressBookRole[] = ['CD', 'RD', 'RI']

type Contact = { name: string, surname: string, email?: string | null }
type School = { code: string, name: string, city: string, province: string, contact?: Contact | null }
export type District = { id?: number | null, name: string, coordinators: Contact[], admins: Contact[], schools: School[] }

export type AddressBookEntry = {
    district: string, role: AddressBookRole, surname: string, name: string, email: string,
    code: string, school: string, city: string, province: string,
}

export function addressBookEntries(districts: District[]): AddressBookEntry[] {
    const entries: AddressBookEntry[] = []
    const noSchool = { code: '', school: '', city: '', province: '' }
    for (const district of districts) {
        const person = (role: AddressBookRole, c: Contact) => ({ district: district.name, role, surname: c.surname, name: c.name, email: c.email || '' })
        for (const c of district.coordinators) entries.push({ ...person('CD', c), ...noSchool })
        for (const c of district.admins) entries.push({ ...person('RD', c), ...noSchool })
        for (const s of district.schools) {
            entries.push({
                ...person('RI', s.contact || { name: '', surname: '' }),
                code: s.code, school: s.name, city: s.city, province: s.province,
            })
        }
    }
    return entries
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Every word of the search must appear in some field of the entry.
export function filterEntries(entries: AddressBookEntry[], roles: Set<AddressBookRole>, search: string) {
    const words = normalize(search).split(/\s+/).filter(Boolean)
    return entries.filter(entry => {
        if (!roles.has(entry.role)) return false
        const text = normalize(Object.values(entry).join(' '))
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
    }))
}
