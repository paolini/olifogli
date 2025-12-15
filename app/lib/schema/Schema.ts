import { Row, ScanResults } from "@/app/graphql/generated"
import { Data, Sheet } from '@/app/lib/models'
import { Field } from './fields'

export type DerivedData = {
    error: string,
    data: Data,
    anomalies: number,
}

export default class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    header_essential: string // senza il nome della gara
    scan_fields: Field[] // nome dei campi presi dalla scansione
    fields_to_be_copied_on_new_row: string[] = [] // nomi dei campi da copiare quando si crea una nuova riga
    fields_to_be_ignored_on_inport: string[] = [] // non si tenta di associare questi nomi a campi esistenti

    constructor(name: string, header: string, fields: Field[]) {
        this.fields = fields
        this.header = header
        this.header_essential = header
        this.name = name
        this.scan_fields = []
    }

    clean(data: Data): Data {
        const cleaned: Data = Object.fromEntries(this.fields
            .map(field => [field.name, field.clean(data[field.name] || "")]))
        return cleaned
    }

    computeDerivedData(data: Data, sheetCommonData?: Data, workbookCommonData?: Data): DerivedData {
        let anomalies = 0;
        for (let i=0; i < this.fields.length; i++) {
            const field = this.fields[i]
            const value = data[field.name]
            if (!field.isValid(value)) return {
                error: `campo "${field.header}" non valido`,
                data,
                anomalies: 0,
            }
            const anomalous = field.anomalous(value);
            if (anomalous) anomalies++;
        }
        return {
            error: '',
            data,
            anomalies,
        }
    }

    csv_header(): string[] {
        return this.fields.map(field => field.name)
    }

    csv_row(row: Data, standardAnswers: boolean): string[] {
        return this.fields.map(field => field.display(row[field.name], '', standardAnswers).csv_value)
    }

    /*
    * accetta un elenco di risultati scansionati
    * e li converte in un dizionario scan_id: {row: Row, data: Data}
    * mappando i risultati sui dati già acquisiti <rows>
    */
    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string,{row: Row|undefined, data: Data}>> {
        throw new Error(`scan_to_data not implemented for schema "${this.name}"`)
    }

    row_to_sheet_data(row: Row): Partial<Sheet> {
        throw new Error(`row_to_sheet_data not implemented for schema "${this.name}"`)
    }

    customized_common_data(data: Data) {
        const tabular: [string,string][] = Object.entries(data)
        const cards: [string,string][] = [] 
        return { tabular, cards }
    }

    get_school_external_id(data: Data): string {
        throw new Error(`lo schema "${this.name}" non ha associata una scuola`)
    }

    get_contest_id(data: Data): number {
        const contestId = parseInt(data["olimanager_contest_id"], 10)
        if (!contestId || isNaN(contestId)) throw new Error(`campo "olimanager_contest_id" mancante nei dati della gara`)
        return contestId
    }

    
}
