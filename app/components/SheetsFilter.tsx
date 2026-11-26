import { Dispatch, SetStateAction, useState } from "react"
import { GetSheetsQuery, Maybe, SheetState } from "../graphql/generated"
import { schemas } from "../lib/schema"
import { pluralize } from "../lib/util"
import { classifySchoolCode, sheetSchoolCode, MACROAREE, INDIRIZZI, Macroarea, Indirizzo } from "../lib/schoolCode"

export type SheetsFilterState = {
    schema: string, // initial value
    schemaFilter: string,
    setSchemaFilter: Dispatch<SetStateAction<string>>,
    distrettoFilter: string,
    setDistrettoFilter: Dispatch<SetStateAction<string>>,
    statoFilter: string,
    setStatoFilter: Dispatch<SetStateAction<string>>,
    // Ricavati dal codice meccanografico della scuola (app/lib/schoolCode.ts).
    macroareaFilter: string,
    setMacroareaFilter: Dispatch<SetStateAction<string>>,
    indirizzoFilter: string,
    setIndirizzoFilter: Dispatch<SetStateAction<string>>,
    // Filtra le righe, non i fogli: lo applicano solo i report che lo supportano.
    classYearFilter: string,
    setClassYearFilter: Dispatch<SetStateAction<string>>,
}

export function useSheetsFilterState({schema=''}: { schema?: string } = {}): SheetsFilterState {
    // Stato per il filtro schema
    const [schemaFilter, setSchemaFilter] = useState<string>(schema)
    // Stato per il filtro distretto
    const [distrettoFilter, setDistrettoFilter] = useState<string>('')
    // Stato per il filtro stato (aperto/chiuso/bloccato)
    const [statoFilter, setStatoFilter] = useState<string>('')
    const [macroareaFilter, setMacroareaFilter] = useState<string>('')
    const [indirizzoFilter, setIndirizzoFilter] = useState<string>('')
    const [classYearFilter, setClassYearFilter] = useState<string>('')
    return {
        schema, schemaFilter, setSchemaFilter, distrettoFilter, setDistrettoFilter, statoFilter, setStatoFilter,
        macroareaFilter, setMacroareaFilter, indirizzoFilter, setIndirizzoFilter, classYearFilter, setClassYearFilter,
    }
}

// Variabili comuni alle query dei report del raccoglitore.
export function reportFilterVariables(filterState: SheetsFilterState) {
    return {
        schema: filterState.schemaFilter || null,
        commonData: filterState.distrettoFilter ? { Distretto: filterState.distrettoFilter } : null,
        state: (filterState.statoFilter as SheetState) || null,
        macroarea: filterState.macroareaFilter || null,
        indirizzo: filterState.indirizzoFilter || null,
    }
}

export interface FilterSheetsSheet {
    name?: string|null;
    schema: string;
    commonData?: Maybe<Record<string, unknown>>;
    closed?: boolean|null;
    locked?: boolean|null;
}

export function filterSheets<Sheet extends FilterSheetsSheet>(filterState: SheetsFilterState, sheets: Sheet[]): Sheet[] {
    const { schemaFilter, distrettoFilter, statoFilter, macroareaFilter, indirizzoFilter } = filterState

    if (schemaFilter) {
        sheets = sheets.filter(s => s.schema === schemaFilter);
    }
    if (distrettoFilter) {
        sheets = sheets.filter(s => s.commonData?.Distretto === distrettoFilter);
    }
    if (statoFilter) {
        sheets = sheets.filter(s => {
            if (statoFilter === 'open') return !s.closed && !s.locked;
            if (statoFilter === 'closed_or_locked') return s.closed || s.locked;
            if (statoFilter === 'closed_not_locked') return s.closed && !s.locked;
            if (statoFilter === 'locked') return s.locked;
            return true;
        });
    }
    if (macroareaFilter || indirizzoFilter) {
        sheets = sheets.filter(s => {
            const school = classifySchoolCode(sheetSchoolCode(s))
            return (!macroareaFilter || school.macroarea === macroareaFilter)
                && (!indirizzoFilter || school.indirizzo === indirizzoFilter)
        })
    }
    return sheets
}

export default function SheetsFilter({ filterState, sheets, filteredSheets, showClassYear = false }: {
    filterState: SheetsFilterState,
    sheets: GetSheetsQuery['sheets'],
    filteredSheets: GetSheetsQuery['sheets'],
    showClassYear?: boolean,
}) {
    const {
        schemaFilter, setSchemaFilter, distrettoFilter, setDistrettoFilter, statoFilter, setStatoFilter,
        macroareaFilter, setMacroareaFilter, indirizzoFilter, setIndirizzoFilter, classYearFilter, setClassYearFilter,
    } = filterState

    // Calcola gli schemi unici presenti nei fogli
    const availableSchemas = Array.from(new Set(sheets.map(s => s.schema)))
        .sort()
    
    // Calcola i distretti unici presenti nei fogli
    const availableDistretti = Array.from(new Set(
        sheets
            .filter(s => s.commonData?.Distretto)
            .map(s => s.commonData!.Distretto as string)
    )).sort()

    // Macroaree e indirizzi delle scuole dei fogli: i filtri compaiono solo se
    // almeno un foglio ha un codice meccanografico riconosciuto.
    const schools = sheets.map(s => classifySchoolCode(sheetSchoolCode(s)))
    const availableMacroaree = (Object.keys(MACROAREE) as Macroarea[]).filter(m => schools.some(s => s.macroarea === m))
    const availableIndirizzi = (Object.keys(INDIRIZZI) as Indirizzo[]).filter(i => schools.some(s => s.indirizzo === i))
    const showSchoolFilters = availableMacroaree.length > 0 || !!macroareaFilter || !!indirizzoFilter

    // Calcola il totale delle righe
    const totalRows = sheets.reduce((sum, s) => sum + s.nRows, 0)
    const filteredRows = filteredSheets.reduce((sum, s) => sum + s.nRows, 0)


    return <div className="mb-2 flex flex-wrap items-center gap-3">
        <select value={schemaFilter} onChange={e => setSchemaFilter(e.target.value)} className="border rounded px-2 py-1">
            <option value="">Tutti gli schemi</option>
            {availableSchemas.map(schemaKey => (
                <option key={schemaKey} value={schemaKey}>
                    {schemas[schemaKey]?.header || schemaKey}
                </option>
            ))}
        </select>
        <select value={distrettoFilter} onChange={e => setDistrettoFilter(e.target.value)} className="border rounded px-2 py-1">
            <option value="">Tutti i distretti</option>
            {availableDistretti.map(distretto => (
                <option key={distretto} value={distretto}>
                    {distretto}
                </option>
            ))}
        </select>
        <select value={statoFilter} onChange={e => setStatoFilter(e.target.value)} className="border rounded px-2 py-1">
            <option value="">Aperti, chiusi o finalizzati</option>
            <option value="open">Aperti</option>
            <option value="closed_not_locked">Chiusi</option>
            <option value="locked">Finalizzati</option>
            <option value="closed_or_locked">Chiusi o finalizzati</option>
        </select>
        {showSchoolFilters && <>
            <select value={macroareaFilter} onChange={e => setMacroareaFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="">Tutte le macroaree</option>
                {availableMacroaree.map(m => <option key={m} value={m}>{m}: {MACROAREE[m]}</option>)}
            </select>
            <select value={indirizzoFilter} onChange={e => setIndirizzoFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="">Tutti gli indirizzi</option>
                {availableIndirizzi.map(i => <option key={i} value={i}>{i}: {INDIRIZZI[i]}</option>)}
            </select>
        </>}
        {showClassYear &&
            <select value={classYearFilter} onChange={e => setClassYearFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="">Tutti gli anni di corso</option>
                {['1', '2', '3', '4', '5'].map(y => <option key={y} value={y}>{y}° anno</option>)}
            </select>
        }
        <span>{pluralize(filteredSheets.length, "foglio", "fogli")} con {pluralize(filteredRows, "riga", "righe")} {(schemaFilter || distrettoFilter || statoFilter || macroareaFilter || indirizzoFilter) && ` (su ${sheets.length} fogli e ${totalRows} righe)`}</span>
    </div>
    }   


