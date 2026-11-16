import { SHEET_CONTEST_KEY } from './olimanagerVenueSheetConfig'

type Permission = { email: string, role: string }
type Candidate = { name: string, schema: string, permissions: Permission[], commonData: Record<string, string> }
type Existing = { _id: { toString(): string }, name: string, schema: string, permissions: Permission[], commonData: Record<string, string> }

export function samePermissions(a: Permission[], b: Permission[]) {
    const signature = (permissions: Permission[]) => JSON.stringify(permissions.map(p => [p.email.trim().toLowerCase(), p.role]).sort())
    return signature(a) === signature(b)
}

export function permissionChanges(current: Permission[], proposed: Permission[]) {
    const roles = (permissions: Permission[]) => {
        const result = new Map<string, Set<string>>()
        for (const p of permissions) {
            const email = p.email.trim().toLowerCase()
            if (!result.has(email)) result.set(email, new Set())
            result.get(email)!.add(p.role)
        }
        return new Map([...result].map(([email, roles]) => [email, [...roles].sort().join(', ')]))
    }
    const before = roles(current), after = roles(proposed)
    return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(email => {
        const previousRole = before.get(email), role = after.get(email)
        return previousRole === role ? [] : [{ email, previousRole, role }]
    })
}

export function applyPermissionChanges(current: Permission[], proposed: Permission[], selectedEmails: Iterable<string>) {
    const selected = new Set([...selectedEmails].map(email => email.trim().toLowerCase()))
    return [
        ...current.filter(p => !selected.has(p.email.trim().toLowerCase())),
        ...proposed.filter(p => selected.has(p.email.trim().toLowerCase())),
    ]
}

export function sheetContest(sheet: { commonData?: Record<string, string> | null }) {
    return String(sheet.commonData?.[SHEET_CONTEST_KEY] ?? '').trim()
}

// A candidate matches the sheets with the same schema and school code. Among
// them, a sheet of the candidate's contest is the same sheet; a sheet without
// contest is proposed for assignment; a sheet of another contest is a conflict.
export function venueSheetPlan<T extends Candidate, S extends Existing>(candidates: T[], existing: S[]) {
    return candidates.map(candidate => {
        const contest = sheetContest(candidate)
        const matches = existing.filter(s => s.schema === candidate.schema && (s.name === candidate.name || s.commonData?.Codice_meccanografico === candidate.name))
        const same = matches.filter(s => sheetContest(s) === contest)
        const unassigned = matches.filter(s => !sheetContest(s))
        const others = matches.filter(s => sheetContest(s) && sheetContest(s) !== contest)
        const key = `${candidate.schema}:${candidate.name}`
        const conflict = (reason: string) => ({ key, candidate, sheet: undefined, action: 'conflict' as const, changes: [], assignContest: false, reason })
        if (same.length > 1) return conflict('più fogli corrispondenti: risolvere i duplicati')
        if (!same.length && others.length) return conflict(`foglio esistente associato al contest #${sheetContest(others[0])}`)
        if (!same.length && unassigned.length > 1) return conflict('più fogli corrispondenti senza contest: risolvere i duplicati')
        const sheet = same[0] || unassigned[0]
        const assignContest = !!sheet && !same.length
        const changes = sheet ? permissionChanges(sheet.permissions, candidate.permissions) : []
        const action = !sheet ? 'create' as const : changes.length || assignContest ? 'update' as const : 'unchanged' as const
        return { key, candidate, sheet, action, changes, assignContest, reason: '' }
    })
}
