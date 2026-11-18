// Olimanager does not record which zone a venue belongs to: venues of zone
// contests are named after it, e.g. «Distretto di Pisa (Gara delle Prime)».
// Shared by sheet creation and participant import, which must agree on names.

export type NamedZone = { name: string }
export type NamedVenue = { id: number, name: string, parentVenue: { id: number } | null }

export const districtName = (zone: NamedZone) => zone.name.replace(/^Distretto di /, '')

export function zonesOfVenue<Z extends NamedZone>(venue: { name: string }, zones: Z[]) {
    return zones.filter(zone => venue.name === zone.name || venue.name.startsWith(`${zone.name} (`))
}

// Sheet name of a top-level venue: its district, or the venue name without
// prefix and parenthesis when no single zone matches.
export function venueSheetName(venue: { name: string }, zones: NamedZone[]) {
    const matches = zonesOfVenue(venue, zones)
    return matches.length === 1 ? districtName(matches[0]) : venue.name.replace(/ \(.*\)$/, '').replace(/^Distretto di /, '')
}

// Sheet name of every venue of a contest; subvenues belong to their parent's sheet.
export function venueSheetNames(venues: NamedVenue[], zones: NamedZone[]) {
    const byId = new Map(venues.map(venue => [venue.id, venue]))
    const names = new Map<number, string>()
    for (const venue of venues) {
        let top = venue
        const seen = new Set<number>()
        while (top.parentVenue && byId.has(top.parentVenue.id) && !seen.has(top.id)) {
            seen.add(top.id)
            top = byId.get(top.parentVenue.id)!
        }
        if (top.parentVenue) continue // Parent outside the contest or cycle: no sheet.
        names.set(venue.id, venueSheetName(top, zones))
    }
    return names
}
