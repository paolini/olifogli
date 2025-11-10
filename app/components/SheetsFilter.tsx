import { Dispatch, SetStateAction, useState } from "react"
import { GetSheetsQuery, Maybe } from "../graphql/generated"
import { schemas } from "../lib/schema"

export type SheetsFilterState = {
    schema: string, // initial value
    schemaFilter: string,
    setSchemaFilter: Dispatch<SetStateAction<string>>,
    distrettoFilter: string,
    setDistrettoFilter: Dispatch<SetStateAction<string>>,
    statoFilter: string,
    setStatoFilter: Dispatch<SetStateAction<string>>,
}

export function useSheetsFilterState({schema=''}: { schema?: string } = {}): SheetsFilterState {
    // Stato per il filtro schema
    const [schemaFilter, setSchemaFilter] = useState<string>(schema)
    // Stato per il filtro distretto
    const [distrettoFilter, setDistrettoFilter] = useState<string>('')
    // Stato per il filtro stato (aperto/chiuso/bloccato)
    const [statoFilter, setStatoFilter] = useState<string>('')
    return { schema, schemaFilter, setSchemaFilter, distrettoFilter, setDistrettoFilter, statoFilter, setStatoFilter }
}

export interface FilterSheetsSheet {
    schema: string;
    commonData?: Maybe<Record<string, unknown>>;
    closed?: boolean|null;
    locked?: boolean|null;
}

export function filterSheets<Sheet extends FilterSheetsSheet>(filterState: SheetsFilterState, sheets: Sheet[]): Sheet[] {
    const { schemaFilter, distrettoFilter, statoFilter } = filterState

    if (schemaFilter) {
        sheets = sheets.filter(s => s.schema === schemaFilter);
    }
    if (distrettoFilter) {
        sheets = sheets.filter(s => s.commonData?.Distretto === distrettoFilter);
    }
    if (statoFilter) {
        sheets = sheets.filter(s => {
            if (statoFilter === 'aperto') return !s.closed && !s.locked;
            if (statoFilter === 'chiuso_o_bloccato') return s.closed || s.locked;
            if (statoFilter === 'chiuso_non_bloccato') return s.closed && !s.locked;
            return true;
        });
    }
    return sheets
}

export default function SheetsFilter({ filterState, sheets, filteredSheets }: { filterState: SheetsFilterState, sheets: GetSheetsQuery['sheets'], filteredSheets: GetSheetsQuery['sheets'] }) {
    const { schema, schemaFilter, setSchemaFilter, distrettoFilter, setDistrettoFilter, statoFilter, setStatoFilter } = filterState

    // Calcola gli schemi unici presenti nei fogli
    const availableSchemas = Array.from(new Set(sheets.map(s => s.schema)))
        .sort()
    
    // Calcola i distretti unici presenti nei fogli
    const availableDistretti = Array.from(new Set(
        sheets
            .filter(s => s.commonData?.Distretto)
            .map(s => s.commonData!.Distretto as string)
    )).sort()


    return <div className="mb-2 flex items-center gap-3">
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
            <option value="">Aperti, chiusi o bloccati</option>
            <option value="aperto">Aperti</option>
            <option value="chiuso_o_bloccato">Chiusi o bloccati</option>
            <option value="chiuso_non_bloccato">Chiusi ma non bloccati</option>
        </select>
        <span>{filteredSheets.length} {filteredSheets.length === 1 ? "foglio" : "fogli"} {(schemaFilter || distrettoFilter || statoFilter) && ` (su ${sheets.length})`}</span>
    </div>
    }   


