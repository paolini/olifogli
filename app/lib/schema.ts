import { Data, Row, ScanResults } from "@/app/lib/models";
import { Field, ChoiceAnswerField, NumericAnswerField, ScoreAnswerField,
    ComputedField,
 } from './fields'

export class Schema {
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
}

export class Archimede extends Schema {
    constructor() {
        super('archimede', 'Archimede', [
            new Field('codice'),
            new Field('cognome'),
            new Field('nome'),
            new Field('dataNascita', 'data di nascita'),
            new Field('classe'),
            new Field('sezione'),
            new Field('scuola'),
            new ChoiceAnswerField('r01', '1'),
            new ChoiceAnswerField('r02', '2'),
            new ChoiceAnswerField('r03', '3'),
            new ChoiceAnswerField('r04', '4'),
            new ChoiceAnswerField('r05', '5'),
            new ChoiceAnswerField('r06', '6'),
            new ChoiceAnswerField('r07', '7'),
            new ChoiceAnswerField('r08', '8'),
            new ChoiceAnswerField('r09', '9'),
            new ChoiceAnswerField('r10', '10'),
            new ChoiceAnswerField('r11', '11'),
            new ChoiceAnswerField('r12', '12'),
            new ComputedField('punti'),
        ])
    }
}

export class Distrettuale extends Schema {
    constructor() {
        super('distrettuale', 'Distrettuale', [
            new Field('cognome'),
            new Field('nome'),
            new Field('classe'),
            new Field('sezione'),
            new Field('scuola'),
            new ChoiceAnswerField('r01', '1'),
            new ChoiceAnswerField('r02', '2'),
            new ChoiceAnswerField('r03', '3'),
            new ChoiceAnswerField('r04', '4'),
            new ChoiceAnswerField('r05', '5'),
            new ChoiceAnswerField('r06', '6'),
            new ChoiceAnswerField('r07', '7'),
            new ChoiceAnswerField('r08', '8'),
            new ChoiceAnswerField('r09', '9'),
            new ChoiceAnswerField('r10', '10'),
            new ChoiceAnswerField('r11', '11'),
            new ChoiceAnswerField('r12', '12'),
            new NumericAnswerField('r13', '13'),
            new NumericAnswerField('r14', '14'),
            new ScoreAnswerField('r15', '15'),
            new ScoreAnswerField('r16', '16'),
            new ScoreAnswerField('r17', '17'),
        ])
    }
}

export class AmmissioneSenior extends Schema {
    constructor() {
        super('ammissione_senior', 'ammissione Senior', [
            new Field('id'),
            new Field('id_short', 'id breve'),
            new Field('cognome'),
            new Field('nome'),
            new Field('scuola_id'),
            new Field('scuola'),
            new Field('zona_id'),
            new Field('zona'),
            new Field('variante'),
            new ComputedField('risposte'),
            new ChoiceAnswerField('r01','01'),
            new ChoiceAnswerField('r02','02'),
            new ChoiceAnswerField('r03','03'),
            new ChoiceAnswerField('r04','04').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r05','05'),
            new ChoiceAnswerField('r06','06'),
            new ChoiceAnswerField('r07','07'),
            new ChoiceAnswerField('r08','08').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r09','09'),
            new ChoiceAnswerField('r10','10'),
            new ChoiceAnswerField('r11','11'),
            new ChoiceAnswerField('r12','12').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r13','13'),
            new ChoiceAnswerField('r14','14'),
            new ChoiceAnswerField('r15','15'),
            new ChoiceAnswerField('r16','16').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r17','17'),
            new ChoiceAnswerField('r18','18'),
            new ChoiceAnswerField('r19','19'),
            new ChoiceAnswerField('r20','20'),
            new ComputedField('punti'),
        ])
        this.name = "ammissione_senior"
        this.scan_fields = this.fields.filter(f => 
            ["scan_id","variante"].includes(f.name) || (f instanceof ChoiceAnswerField)
        )
    }

    csv_header(): string[] {
        return [
            ...super.csv_header(),
            "stringa risposte",
        ]
    }

    csv_row(row: Data): string[] {
        const baseRow = super.csv_row(row)

        // costruisce la stringa delle risposte
        // sostituendo i trattini con 'V' e gli spazi vuoti con 'X'

        const answers = this.fields
            .filter(field => (field instanceof ChoiceAnswerField))
            .map(field => (row[field.name] || 'X').replace('-','V').replace(' ','X'))
            .join("")
        return [...baseRow, answers]
    }

    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string, {row: Row|undefined, data: Data}>> {
        /*
        expected scan.data:
          "data": {
            "score": "0",
            "StudentCode": "012345678901234567890123456789",
            "TestCode": "012345678",
            "Answer1": "ABCDE",
            "Answer2": "ABCDE",
            "Answer3": "ABCDE",
            ...
            "Answer20": "ABCDE"
        }
        */

        // costruisce un dizionario short_id -> Row
        // dove short_id (ovvero StudentCode)
        // sono le ultime tre cifre di row.id
        const data_dict = Object.fromEntries(rows
            .map(row => [parseInt(row.data.id) % 1000, row] as [number,Row])
            .filter(([short_id,_]) => !isNaN(short_id))
            .map(([short_id, data]) => [short_id.toString().padStart(3, '0'), data] as [string,Row])
        )

        return Object.fromEntries(scan.map(scan => {
            // non assumere nulla su san.raw_data
            // perché potrebbe contenere dati codificati 
            // con un formato vecchio.
            const raw = scan.raw_data || {}
            const id_short = raw?.StudentCode || ''
            const row = data_dict[id_short]
            const data: Data = {...(row?.data || {})}
            data.id_short = id_short
            data.variante = raw?.TestCode || ''
            this.fields.filter(field => field instanceof ChoiceAnswerField)
                .forEach((field,i) => {
                    data[field.name] = convert_answer(raw[`Answer${i+1}`]) || ''
                })
            return [scan._id,{row, data: this.clean(data)}]
        }))

        function convert_answer(s: string) {
            return {
                '': '-',
                'X': '-',
                'A': 'A',
                'B': 'B',
                'C': 'C',
                'D': 'D',
                'E': 'E',
                'BCDE': 'A',
                'ACDE': 'B',
                'ABDE': 'C',
                'ABCE': 'D',
                'ABCD': 'E',
                'ABCDE': '-',
            }[s] ?? s
        }
    }
}

export const schemas = {
    "archimede": new Archimede(),
    "distrettuale": new Distrettuale(),
    "ammissione_senior": new AmmissioneSenior(),
}

export type AvailableSchemas = keyof typeof schemas
