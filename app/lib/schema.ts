import { Data, ScanResults } from "@/app/lib/models";

export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_style: string // used in CSS
    editable: boolean
    widget: string // identify the HTML input widget

    constructor(name: string, header?: string) {
        this.name = name
        this.header = header || name
        this.css_style = `field-${this.name}`
        this.editable = true
        this.widget = 'Input'
    }

    clean(value: string): string {
        return value.trim()
    }

    isValid(value: string): boolean {
        return value !== ""
    }
}
    
export class ComputedField extends Field {
    constructor(name: string) {
        super(name)
        this.editable = false
    }

    valueIsValid(_: string): boolean {
        return true
    }
}

export class ChoiceAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-ChoiceAnswer`
        this.widget = 'ChoiceInput'
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-NumericAnswer`
        this.widget = 'NumericInput'
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-ScoreAnswer`
        this.widget = 'ScoreInput'
    }
}

export class Schema {
    fields: Field[]
    name: string // da usare nel codice
    header: string // da usare nella UI
    params: string
    
    constructor(name: string, header: string, fields: Field[], params: string='{}') {
        this.fields = fields
        this.header = header
        this.name = name
        this.params = params
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
            new ComputedField('punti'),
        ], params)
    }
}

export class AmmissioneSenior extends Schema {
    constructor(params: string='{}') {
        super('ammissione_senior', 'ammissione Senior', [
            new Field('id'),
            new Field('cognome'),
            new Field('nome'),
            new Field('scuola_id'),
            new Field('scuola'),
            new Field('zona_id'),
            new Field('zona'),
            new ChoiceAnswerField('r01','1'),
            new ChoiceAnswerField('r02','2'),
            new ChoiceAnswerField('r03','3'),
            new ChoiceAnswerField('r04','4'),
            new ChoiceAnswerField('r05','5'),
            new ChoiceAnswerField('r06','6'),
            new ChoiceAnswerField('r07','7'),
            new ChoiceAnswerField('r08','8'),
            new ChoiceAnswerField('r09','9'),
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
        data.id = scan.data.StudentCode || ""

        // TO BE COMPLETED
        return this.clean(data)
    }
}

export const schemas = {
    "archimede": new Archimede(),
    "distrettuale": new Distrettuale(),
    "ammissioneSenior": new AmmissioneSenior(),
}

export type AvailableSchemas = keyof typeof schemas
