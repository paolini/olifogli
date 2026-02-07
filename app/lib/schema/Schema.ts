import { ReportEntry, Row, ScanResults } from "@/app/graphql/generated"
import { Data, Sheet, Row as RowModel, Permission as PermissionModel } from '@/app/lib/models'
import { Field, ValidationContext } from './fields'

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

export default class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    header_essential: string // senza il nome della gara
    scan_fields: Field[] // nome dei campi presi dalla scansione
    fields_to_be_copied_on_new_row: string[] = [] // nomi dei campi da copiare quando si crea una nuova riga
    fields_to_be_ignored_on_inport: string[] = [] // non si tenta di associare questi nomi a campi esistenti
    selections: Selection[] = [] // selezioni possibili per questo schema
    row_to_sheet: undefined | ((row: RowModel) => RowToSheetsResult|string) = undefined
    extract_olimanager_results: undefined | ((row: RowModel, sheetData: Data, workbookData: Data) => OlimanagerProblemResult[]) = undefined
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

    validationContext(data: Data, workbookCommonData: Data): ValidationContext {
        const context_year = workbookCommonData['contest_year'] || ''
        const context: ValidationContext = {
            absent: false,
            contest_year: parseInt(context_year, 10),
        }
        const absent_field = this.absent_field
        if (absent_field) {
            context.absent = data[absent_field] === '1'
        } else {
            const variant_field = this.variant_field
            if (variant_field) {
                const variant = data[variant_field] || ''
                context.absent =  variant === '000' || variant === '0'
            }
        }
        return context
    }

    computeDerivedData(data: Data, sheetCommonData: Data, workbookCommonData: Data): DerivedData {
        let anomalies = 0;
        // console.log(`Computing derived data for schema "${this.name}" with data:`, data, 'sheetCommonData:', sheetCommonData, 'workbookCommonData:', workbookCommonData)
        const context = this.validationContext(data, workbookCommonData);

        for (let i=0; i < this.fields.length; i++) {
            const field = this.fields[i]
            const value = data[field.name]
            if (!field.isValid(value, context)) return {
                error: `campo "${field.header}" non valido`,
                data,
                anomalies: 0,
            }
            const anomalous = field.anomalous(value, context);
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

    get_school_external_id(row_data: Data, sheet_data: Data): string {
        throw new Error(`lo schema "${this.name}" non ha associata una scuola`)
    }

    get_contest_id(data: Data): number {
        const primary_contest_field_name = `olimanager_${this.name}_contest_id`
        const secondary_contest_field_name = `olimanager_contest_id`
        const contestId = parseInt(data[primary_contest_field_name] || data[secondary_contest_field_name] || '', 10)
        if (!contestId || isNaN(contestId)) throw new Error(`campi ${primary_contest_field_name} e ${secondary_contest_field_name} mancanti nella configurazione della competizione`)
        return contestId
    }   
}
