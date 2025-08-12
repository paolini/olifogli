import { Row, ScanResults } from "@/app/graphql/generated"
import { Data, Sheet } from '@/app/lib/models'
import { Field } from './fields'

export default class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    scan_fields: Field[] // nome dei campi presi dalla scansione
    
    constructor(name: string, header: string, fields: Field[]) {
        this.fields = fields
        this.header = header
        this.name = name
        this.scan_fields = []
    }

    clean(data: Data): Data {
        const cleaned: Data = Object.fromEntries(this.fields
            .map(field => [field.name, field.clean(data[field.name] || "")]))
        return cleaned
    }

    // da integrare con un set di condizioni completo
    isValid(row: Data): boolean {
        for (let i=0; i < this.fields.length; i++) {
            const field = this.fields[i]
            const value = row[field.name]
            if (!field.isValid(value)) return false
        }
        return true
    } 

    csv_header(): string[] {
        return this.fields.map(field => field.name)
    }

    csv_row(row: Data): string[] {
        return this.fields.map(field => row[field.name])
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
}

