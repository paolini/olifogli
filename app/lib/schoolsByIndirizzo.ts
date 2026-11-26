import { classifySchoolCode, sheetSchoolCode, INDIRIZZI, Indirizzo } from './schoolCode'

export type SchoolsByIndirizzoSheet = {
    name?: string | null,
    schema: string,
    commonData?: Record<string, unknown> | null,
    nValidRows: number,
}

export type SchoolsByIndirizzoRow = {
    indirizzo: Indirizzo | 'totale',
    schools: number,
    biennio: number,
    triennio: number,
    total: number,
}

// Scuole e alunni (righe valide) per indirizzo. Una scuola con fogli per
// biennio e triennio si conta una volta: la chiave è il codice meccanografico.
export function schoolsByIndirizzo(sheets: SchoolsByIndirizzoSheet[]): SchoolsByIndirizzoRow[] {
    const rows = (Object.keys(INDIRIZZI) as Indirizzo[]).map(indirizzo => ({
        indirizzo, schools: new Set<string>(), biennio: 0, triennio: 0,
    }))
    for (const sheet of sheets) {
        const code = sheetSchoolCode(sheet).toUpperCase()
        const row = rows.find(r => r.indirizzo === classifySchoolCode(code).indirizzo)!
        row.schools.add(code)
        if (sheet.schema === 'archimede_biennio') row.biennio += sheet.nValidRows
        if (sheet.schema === 'archimede_triennio') row.triennio += sheet.nValidRows
    }
    const result: SchoolsByIndirizzoRow[] = rows.map(r => ({
        indirizzo: r.indirizzo, schools: r.schools.size, biennio: r.biennio, triennio: r.triennio, total: r.biennio + r.triennio,
    }))
    // Lo stesso codice ha sempre lo stesso indirizzo: le scuole si possono sommare.
    result.push(result.reduce((sum, r) => ({
        ...sum, schools: sum.schools + r.schools, biennio: sum.biennio + r.biennio, triennio: sum.triennio + r.triennio, total: sum.total + r.total,
    }), { indirizzo: 'totale', schools: 0, biennio: 0, triennio: 0, total: 0 }))
    return result
}
