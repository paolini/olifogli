import { Data, ScanResults } from "@/app/lib/models";
import { Field, ChoiceAnswerField, NumericAnswerField, ScoreAnswerField,
    ComputedField,
 } from './fields'

export class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    scan_fields: Field[] // nome dei campi presi dalla scansione
    params: string
    
    constructor(name: string, header: string, fields: Field[], params: string='{}') {
        this.fields = fields
        this.header = header
        this.name = name
        this.params = params
        this.scan_fields = []
    }

    clean(data: Data): Data {
        const cleaned: Data = Object.fromEntries(this.fields
            .map(field => [field.name, field.clean(data[field.name] || "")]))
        return cleaned
    }

    // da integrare con un set di condizioni completo
    isValid(row: Data): boolean {
        for (var i=0; i < this.fields.length; i++) {
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

    scan_to_data(scan: ScanResults): Data {
        throw new Error(`scan_to_data not implemented for schema "${this.name}"`)
    }
}

export class Archimede extends Schema {
    constructor(params: string='{}') {
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
        ], params)
    }
}

export class Distrettuale extends Schema {
    constructor(params: string='{}') {
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
        ], params)
    }
}

export class AmmissioneSenior extends Schema {
    constructor(params: string='{}') {
        super('ammissione_senior', 'ammissione Senior', [
            new Field('id'),
            new Field('scan_id','id scan'),
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
            new ChoiceAnswerField('r04','04'),
            new ChoiceAnswerField('r05','05'),
            new ChoiceAnswerField('r06','06'),
            new ChoiceAnswerField('r07','07'),
            new ChoiceAnswerField('r08','08'),
            new ChoiceAnswerField('r09','09'),
            new ChoiceAnswerField('r10','10'),
            new ChoiceAnswerField('r11','11'),
            new ChoiceAnswerField('r12','12'),
            new ChoiceAnswerField('r13','13'),
            new ChoiceAnswerField('r14','14'),
            new ChoiceAnswerField('r15','15'),
            new ChoiceAnswerField('r16','16'),
            new ChoiceAnswerField('r17','17'),
            new ChoiceAnswerField('r18','18'),
            new ChoiceAnswerField('r19','19'),
            new ChoiceAnswerField('r20','20'),
            new ComputedField('punti'),
        ], params)
        this.params = params
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
        const answers = this.fields
            .filter(field => (field instanceof ChoiceAnswerField))
            .map(field => row[field.name] || "X")
            .join("")
        return [...baseRow, answers]
    }

    scan_to_data(scan: ScanResults): Data {
        /*
        example scan.data:
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
        const data: Data = {}
        data.scan_id = scan.data.StudentCode || ''
        data.variante = scan.data.TestCode || ''
        this.fields.filter(field => field instanceof ChoiceAnswerField)
            .forEach((field,i) => {
                data[field.name] = convert_answer(scan.data[`Answer${i+1}`]) || ''
            })
        return this.clean(data)

        function convert_answer(s: string) {
            return {
                '': '-',
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
    "ammissioneSenior": new AmmissioneSenior(),
}

export type AvailableSchemas = keyof typeof schemas
