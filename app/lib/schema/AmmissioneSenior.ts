import { Field, ChoiceAnswerField } from './fields'
import Schema from './Schema'
import { Row, ScanResults } from '@/app/graphql/generated'
import { Data } from '@/app/lib/models'

export default class AmmissioneSenior extends Schema {
    constructor() {
        super('ammissione_senior', 'ammissione Senior', [
            new Field('id'),
            new Field('id_short', {header: 'id breve'}),
            new Field('cognome', {header: 'cognome'}),
            new Field('nome', {header: 'nome'}),
            new Field('scuola_id', {header: 'scuola_id'}),
            new Field('scuola', {header: 'scuola'}),
            new Field('zona_id', {header: 'zona_id'}),
            new Field('zona', {header: 'zona'}),
            new Field('variante', {header: 'variante'}),
            new Field('risposte', {header: 'risposte', editable: false}),
            new ChoiceAnswerField('r01', {header: '01'}),
            new ChoiceAnswerField('r02', {header: '02'}),
            new ChoiceAnswerField('r03', {header: '03'}),
            new ChoiceAnswerField('r04', {header: '04', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r05', {header: '05'}),
            new ChoiceAnswerField('r06', {header: '06'}),
            new ChoiceAnswerField('r07', {header: '07'}),
            new ChoiceAnswerField('r08', {header: '08', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r09', {header: '09'}),
            new ChoiceAnswerField('r10', {header: '10'}),
            new ChoiceAnswerField('r11', {header: '11'}),
            new ChoiceAnswerField('r12', {header: '12', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r13', {header: '13'}),
            new ChoiceAnswerField('r14', {header: '14'}),
            new ChoiceAnswerField('r15', {header: '15'}),
            new ChoiceAnswerField('r16', {header: '16', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r17', {header: '17'}),
            new ChoiceAnswerField('r18', {header: '18'}),
            new ChoiceAnswerField('r19', {header: '19'}),
            new ChoiceAnswerField('r20', {header: '20'}),
            new Field('punti', {header: 'punti', type: "number",editable: false, required: false, additionalCssStyle: 'thick-border-right'}),
        ])
        this.name = "ammissione_senior"
        this.scan_fields = this.fields.filter(f => 
            ["scan_id","variante"].includes(f.name) || (f instanceof ChoiceAnswerField)
        )
        this.fields_sensitive_names = ["cognome", "nome"]
    }

    csv_header(): string[] {
        return [
            ...super.csv_header(),
            "stringa risposte",
        ]
    }

    csv_row(row: Data, standardAnswers: boolean): string[] {
        const baseRow = super.csv_row(row, standardAnswers)
        const answers = this.fields
            .filter(field => (field instanceof ChoiceAnswerField))
            .map(field => (row[field.name] || 'X').replace('-','V').replace(' ','X'))
            .join("")
        return [...baseRow, answers]
    }

    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string, {row: Row|undefined, data: Data}>> {
        const data_dict = Object.fromEntries(rows
            .map(row => [parseInt(row.data.id) % 1000, row] as [number,Row])
            .filter(([short_id,_]) => !isNaN(short_id))
            .map(([short_id, data]) => [short_id.toString().padStart(3, '0'), data] as [string,Row])
        )

        return Object.fromEntries(scan.map(scan => {
            const raw = scan.rawData || {}
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
