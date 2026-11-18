// Olimanager contest of a sheet, stored in the sheet's commonData.
export const SHEET_CONTEST_KEY = 'olimanager_contest_id'

// Schemas whose sheets can be created from Olimanager, with the contest scope
// they accept and where their venues come from:
// - `schools`: one sheet per school validly subscribed to the edition
//   (SCHOOL contests); the contact is manager, the district admins (RD) viewers.
// - `venues`: one sheet per top-level venue of the contest (ZONE contests),
//   named after its district; the venue admins are managers, the RD editors.
//   Their rows can be imported from the contest participants
//   (`import_participants` job).
export const VENUE_SHEET_SCHEMAS = {
    archimede_biennio: { label: 'Archimede Biennio', scope: 'SCHOOL', source: 'schools' },
    archimede_triennio: { label: 'Archimede Triennio', scope: 'SCHOOL', source: 'schools' },
    gara_prime: { label: 'Gara delle prime', scope: 'ZONE', source: 'venues' },
    distrettuale: { label: 'Gara distrettuale', scope: 'ZONE', source: 'venues' },
} as const
export type VenueSheetSchema = keyof typeof VENUE_SHEET_SCHEMAS
export function isVenueSheetSchema(schema: string): schema is VenueSheetSchema {
    return Object.hasOwn(VENUE_SHEET_SCHEMAS, schema)
}
export function isParticipantImportSchema(schema: string): schema is VenueSheetSchema {
    return isVenueSheetSchema(schema) && VENUE_SHEET_SCHEMAS[schema].source === 'venues'
}
