import { Field, ChoiceAnswerField, ComputedField } from './fields'
import Schema from './Schema'
import { Data, Row, ScanResults } from '../models'

export default class AmmissioneSenior extends Schema {
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
