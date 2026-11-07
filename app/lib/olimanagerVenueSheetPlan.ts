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

export function venueSheetPlan<T extends Candidate, S extends Existing>(candidates: T[], existing: S[]) {
    return candidates.map(candidate => {
        const matches = existing.filter(s => s.schema === candidate.schema && (s.name === candidate.name || s.commonData?.Codice_meccanografico === candidate.name))
        const sheet = matches.length === 1 ? matches[0] : undefined
        const changes = sheet ? permissionChanges(sheet.permissions, candidate.permissions) : []
        const action = matches.length > 1 ? 'conflict' : !sheet ? 'create' : changes.length ? 'update' : 'unchanged'
        return { key: `${candidate.schema}:${candidate.name}`, candidate, sheet, action, changes }
    })
}
