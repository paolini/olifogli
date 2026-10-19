import type { Row, Sheet, Workbook } from './models'
import { schemas } from './schema'

export function validateOlimanagerJobRow(row: Row, sheet: Sheet, workbook: Workbook): void {
    const schema = schemas[sheet.schema]
    if (!schema) throw new Error(`Schema non trovato: ${sheet.schema}`)
    const context = schema.validationContext(sheet.commonData, workbook.commonData)
    if (!Number.isSafeInteger(context.contest_id) || context.contest_id <= 0) throw new Error('ID gara Olimanager mancante o non valido nella raccolta.')
    if (!context.school_external_id(row.data)?.trim()) throw new Error('Codice meccanografico mancante.')
    if (row.encrypted_data) throw new Error('La riga è criptata: decriptarla prima del trasferimento.')
    if (row.error) throw new Error(`Riga non valida: ${row.error}`)
}
