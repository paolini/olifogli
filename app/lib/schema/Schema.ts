// Schema does not import crypto directly; caller provides cipher/encoder
import { ReportEntry, Row, ScanResults } from "@/app/graphql/generated"
import { Data, Sheet, Row as RowModel, Permission as PermissionModel } from '@/app/lib/models'
import { Field } from './fields'
import { ValidationContext } from "./Context"

export type DerivedData = {
    error: string,
    data: Data,
    anomalies: number,
}

export type Selection = {
    label: string,
    name: string,
    color: string,
    row_filter?: Record<string, unknown>,
}

export type RowCalculationResult = {
    totalScore: number|undefined;
    problemScores: number[]; 
    processedAnswers: Record<string, string>;
    error?: string;
}

export type OlimanagerProblemResult = {
  participantId: number;
  problemIndex: number;
  score: number | null;
  disqualified: boolean;
}

export type RowToSheetsResult = {
    sheet: {
        schema: string,
        name: string,
        permissions?: PermissionModel[]
        data?: Data,
    },
    row?: {
        data: Data,
        olimanager?: {
            participantId?: string,
            contestId?: string,
        },
        unique_keys: string[], // nomi dei campi da usare come chiavi univoche per la riga
    }
}

export type EncryptedData = {
    encrypted_data: string,
    truncated_fields: Record<string, string>
}

export default class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    header_essential: string // senza il nome della gara
    scan_fields: Field[] // nome dei campi presi dalla scansione
    fields_to_be_copied_on_new_row: string[] = [] // nomi dei campi da copiare quando si crea una nuova riga
    fields_to_be_ignored_on_inport: string[] = [] // non si tenta di associare questi nomi a campi esistenti
    fields_sensitive_names: string[] = [] // nomi dei campi contenenti dati sensibili da crittografare
    fields_sensitive_dates: string[] = [] // nomi dei campi contenenti date sensibili da crittografare
    selections: Selection[] = [] // selezioni possibili per questo schema
    row_to_sheet: undefined | ((row: RowModel) => RowToSheetsResult|string) = undefined
    extract_olimanager_results: undefined | ((row: RowModel, context: ValidationContext) => OlimanagerProblemResult[]) = undefined
    extract_ranking: undefined | ((row: RowModel, sheet: Sheet) => ReportEntry | undefined) = undefined
    variant_field: string = '';
    absent_field: string = '';

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

    validationContext(sheetCommonData: Data, workbookCommonData: Data): ValidationContext {
        const context_year = workbookCommonData['contest_year'] || ''
        const context: ValidationContext = {
            absent: (data: Data) => false,
            contest_year: parseInt(context_year, 10),
            contest_id: NaN,
            school_external_id: (data: Data) => '',
        }
        const absent_field = this.absent_field
        if (absent_field) {
            context.absent = (data: Data) => data[absent_field] === '1'
        } else {
            const variant_field = this.variant_field
            if (variant_field) {
                context.absent = (data: Data) => {
                    const variant = data[variant_field] || ''
                    return variant === '000' || variant === '0'
                }
            }
        }
        const primary_contest_field_name = `olimanager_${this.name}_contest_id`
        const secondary_contest_field_name = `olimanager_contest_id`
        context.contest_id = parseInt(workbookCommonData[primary_contest_field_name] || workbookCommonData[secondary_contest_field_name] || '', 10)

        return context
    }

    computeDerivedData(data: Data, context: ValidationContext): DerivedData {
        const row_context = {
            absent: context.absent(data),
            context,
        }
        let anomalies = 0;

        for (let i=0; i < this.fields.length; i++) {
            const field = this.fields[i]
            const value = data[field.name]
            const error = field.checkValid(value, row_context)
            if (error) return {
                error: `campo "${field.header}": ${error}`,
                data,
                anomalies: 0,
            }
            const anomalous = field.anomalous(value, row_context);
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

    has_scan_functionality(): boolean {
        try {
            this.scans_to_data_dict([], [])
            return true
        } catch {
            return false
        }
    }

    row_to_sheet_data(row: Row): Partial<Sheet> {
        throw new Error(`row_to_sheet_data not implemented for schema "${this.name}"`)
    }

    customized_common_data(data: Data) {
        const tabular: [string,string][] = Object.entries(data)
        const cards: [string,string][] = [] 
        return { tabular, cards }
    }

    encrypt(data: Data, encrypt_function: (payload: string) => string): EncryptedData {
        if (this.fields_sensitive_names.length + this.fields_sensitive_dates.length === 0) {
            return {
                encrypted_data: '',
                truncated_fields: {},
            }
        }
        const source_string = JSON.stringify(Object.fromEntries(
            [...this.fields_sensitive_names, ...this.fields_sensitive_dates].map(field_name => [field_name, data[field_name] || ''])
        ))

        const encrypted_string = encrypt_function(source_string)
        // mantiene le iniziali di nome e cognome e l'anno della data, 
        const truncated_fields = Object.fromEntries([
            ...this.fields_sensitive_names.map(field_name => {
                const value = data[field_name] || ''
                const truncated = value.split(' ').map(part => part[0] || '').join('')
                return [field_name, truncated]
            }),
            ...this.fields_sensitive_dates.map(field_name => {
                const value = data[field_name] || ''
                const truncated = value.length === 10 ? `01/01/${value.slice(6,10)}` : ''
                return [field_name, truncated]
            })
        ])
        return {
            encrypted_data: encrypted_string,
            truncated_fields,
        }
    }
}