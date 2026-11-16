// Olimanager contest of a sheet, stored in the sheet's commonData.
export const SHEET_CONTEST_KEY = 'olimanager_contest_id'

// Schemas whose sheets can be created from Olimanager, with their label.
// Each one is created from the schools validly subscribed to a SCHOOL contest.
export const VENUE_SHEET_SCHEMAS = {
    archimede_biennio: 'Archimede Biennio',
    archimede_triennio: 'Archimede Triennio',
} as const
export type VenueSheetSchema = keyof typeof VENUE_SHEET_SCHEMAS
export function isVenueSheetSchema(schema: string): schema is VenueSheetSchema {
    return Object.hasOwn(VENUE_SHEET_SCHEMAS, schema)
}
