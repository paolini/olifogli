// Classificazione di una scuola dal suo codice meccanografico (es. PIPS01000X):
// le prime due lettere sono la sigla della provincia, la terza e la quarta il
// tipo di scuola. Serve alle statistiche per macroarea e per indirizzo.

export type Macroarea = 'NO' | 'NE' | 'C' | 'S' | 'IS'
export type Indirizzo = 'LS' | 'AL' | 'TP' | 'NI'

export const MACROAREE: Record<Macroarea, string> = {
    NO: 'Nord-Ovest',
    NE: 'Nord-Est',
    C: 'Centro',
    S: 'Sud',
    IS: 'Isole e Calabria',
}

export const INDIRIZZI: Record<Indirizzo, string> = {
    LS: 'Liceo scientifico',
    AL: 'Altri licei',
    TP: 'Tecnici, professionali e altri',
    NI: 'Indirizzo non identificato',
}

const REGIONS: Record<string, { macroarea: Macroarea, provinces: string[] }> = {
    'Piemonte': { macroarea: 'NO', provinces: ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'] },
    "Valle d'Aosta": { macroarea: 'NO', provinces: ['AO'] },
    'Liguria': { macroarea: 'NO', provinces: ['GE', 'IM', 'SP', 'SV'] },
    'Lombardia': { macroarea: 'NO', provinces: ['BG', 'BS', 'CO', 'CR', 'LC', 'LO', 'MB', 'MI', 'MN', 'PV', 'SO', 'VA'] },
    'Veneto': { macroarea: 'NE', provinces: ['BL', 'PD', 'RO', 'TV', 'VE', 'VI', 'VR'] },
    'Trentino-Alto Adige': { macroarea: 'NE', provinces: ['BZ', 'TN'] },
    'Friuli-Venezia Giulia': { macroarea: 'NE', provinces: ['GO', 'PN', 'TS', 'UD'] },
    // FO: sigla storica di Forlì-Cesena, ancora usata nei codici meccanografici.
    'Emilia-Romagna': { macroarea: 'NE', provinces: ['BO', 'FC', 'FE', 'FO', 'MO', 'PC', 'PR', 'RA', 'RE', 'RN'] },
    'Toscana': { macroarea: 'C', provinces: ['AR', 'FI', 'GR', 'LI', 'LU', 'MS', 'PI', 'PO', 'PT', 'SI'] },
    'Umbria': { macroarea: 'C', provinces: ['PG', 'TR'] },
    // PS: sigla storica di Pesaro e Urbino, ancora usata nei codici meccanografici.
    'Marche': { macroarea: 'C', provinces: ['AN', 'AP', 'FM', 'MC', 'PS', 'PU'] },
    'Lazio': { macroarea: 'C', provinces: ['FR', 'LT', 'RI', 'RM', 'VT'] },
    'Abruzzo': { macroarea: 'C', provinces: ['AQ', 'CH', 'PE', 'TE'] },
    'Molise': { macroarea: 'S', provinces: ['CB', 'IS'] },
    'Campania': { macroarea: 'S', provinces: ['AV', 'BN', 'CE', 'NA', 'SA'] },
    'Puglia': { macroarea: 'S', provinces: ['BA', 'BR', 'BT', 'FG', 'LE', 'TA'] },
    'Basilicata': { macroarea: 'S', provinces: ['MT', 'PZ'] },
    'Calabria': { macroarea: 'IS', provinces: ['CS', 'CZ', 'KR', 'RC', 'VV'] },
    'Sicilia': { macroarea: 'IS', provinces: ['AG', 'CL', 'CT', 'EN', 'ME', 'PA', 'RG', 'SR', 'TP'] },
    // Comprende le sigle delle province sarde soppresse (CI, OG, OT, VS).
    'Sardegna': { macroarea: 'IS', provinces: ['CA', 'CI', 'NU', 'OG', 'OR', 'OT', 'SS', 'SU', 'VS'] },
}

const REGION_BY_PROVINCE = new Map<string, string>(
    Object.entries(REGIONS).flatMap(([region, { provinces }]) => provinces.map(p => [p, region] as [string, string]))
)

// Due lettere di provincia, due di tipo, sei caratteri alfanumerici.
const CODE_PATTERN = /^([A-Z]{2})([A-Z]{2})[A-Z0-9]{6}$/

export type SchoolClassification = {
    region: string | null,
    macroarea: Macroarea | null,
    indirizzo: Indirizzo,
}

export function classifySchoolCode(code: string | null | undefined): SchoolClassification {
    const match = (code ?? '').trim().toUpperCase().match(CODE_PATTERN)
    if (!match) return { region: null, macroarea: null, indirizzo: 'NI' }
    const [, province, type] = match
    const region = REGION_BY_PROVINCE.get(province) ?? null
    return {
        region,
        macroarea: region ? REGIONS[region].macroarea : null,
        indirizzo: indirizzoOfType(type),
    }
}

function indirizzoOfType(type: string): Indirizzo {
    if (type === 'PS') return 'LS'
    // SL e SD: licei artistici.
    if (type.startsWith('P') || type === 'SL' || type === 'SD') return 'AL'
    // IS: istituti con più indirizzi, non si sa quale frequenti lo studente.
    if (type === 'IS') return 'NI'
    return 'TP'
}

// Codice della scuola di un foglio: i fogli creati da Olimanager lo hanno nei
// dati comuni; quelli del vecchio flusso spesso hanno il codice come nome.
export function sheetSchoolCode(sheet: { name?: string | null, commonData?: Record<string, unknown> | null }): string {
    const code = sheet.commonData?.Codice_meccanografico
    if (typeof code === 'string' && code.trim()) return code.trim()
    return (sheet.name ?? '').trim()
}
