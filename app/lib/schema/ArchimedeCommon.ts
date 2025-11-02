import { Data, Row, ScanResults } from '../models'
import { Field, ChoiceAnswerField, DateField, OptionsField } from './fields'
import {decodePermutations, buildPermutationsObject} from './PERMUTATIONS'
import Schema, { DerivedData } from './Schema'

export default class ArchimedeCommon extends Schema {
    constructor(name: string, description: string) {
        super(name, description, [
            new Field('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            new Field('surname',{header: "Cognome"}),
            new Field('name',{header: "Nome"}),
            new DateField('birthDate',{header: 'Data di nascita'}),
            new OptionsField('classYear', ['1','2','3','4','5'], {header:'Anno di corso', numeric: true, alternativeNames: ['anno']}),
            new Field('classSection',{header:'Sezione'}),
            new Field('variant',{header: "Codice compito", additionalCssStyle: 'thick-border-left'}),
            new ChoiceAnswerField('r01', {header: '1', additionalCssStyle: 'thick-border-left'}),
            new ChoiceAnswerField('r02', {header: '2'}),
            new ChoiceAnswerField('r03', {header: '3'}),
            new ChoiceAnswerField('r04', {header: '4', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r05', {header: '5'}),
            new ChoiceAnswerField('r06', {header: '6'}),
            new ChoiceAnswerField('r07', {header: '7'}),
            new ChoiceAnswerField('r08', {header: '8', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r09', {header: '9'}),
            new ChoiceAnswerField('r10', {header: '10'}),
            new ChoiceAnswerField('r11', {header: '11'}),
            new ChoiceAnswerField('r12', {header: '12', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r13', {header: '13'}),
            new ChoiceAnswerField('r14', {header: '14'}),
            new ChoiceAnswerField('r15', {header: '15'}),
            new ChoiceAnswerField('r16', {header: '16', additionalCssStyle: 'thick-border-right'}),
            new Field('score', {header: 'Punti', numeric: true, editable: false, required: false, additionalCssStyle: 'thick-border-right', css_style: score_to_color_style}),
        ])
        this.fields_to_be_copied_on_new_row = ['classYear', 'classSection']
        this.fields_to_be_ignored_on_inport = ['Nome concorrente', 'Email', 'ID utente', 'Genere', 'Codice fiscale', 'Ruolo', 'Verificato', 'Approvato/a', 'Approvato/a il', 'Idoneo/a', 'Codice meccanografico', 'Tipo scuola', 'Nome scuola', 'Città scuola', 'Provincia scuola', 'Sigla provincia scuola', 'Regione scuola', 'Email scuola', 'Data creazione membro'];

    }

    computeDerivedData(data: Data, sheetCommonData?: Data, workbookCommonData?: Data): DerivedData {
        const validated = super.computeDerivedData(data, sheetCommonData, workbookCommonData)
        data = validated.data
        data = {...data, score:''}
        if (validated.error) return validated
        const variant = data['variant'] || ''
        if (!variant) return {
            error: 'variante mancante',
            data,
        }
        const choice_fields = this.fields.filter(f => f instanceof ChoiceAnswerField)
        const answers = choice_fields.map(f => data[f.name] || '')
        try {
            const permutations = buildPermutationsObject(sheetCommonData, workbookCommonData);
            const {score, error, extended_answers} = decodePermutations(variant, answers, permutations);
            data.score = `${score}`
            choice_fields.forEach((f, i) => {
                data[f.name] = extended_answers[i] || ''
            })
            return {
                error,
                data
            }
        } catch (e) {
            return {
                error: `errore di configurazione della raccolta: ${(e as Error).message}`,
                data,
            }
        }
    }

    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string, {row: Row|undefined, data: Data}>> {
        const existing_data_dict = Object.fromEntries(rows
            .map(row => [parseInt(row.data.id) % 1000, row] as [number,Row])
            .filter(([short_id,_]) => !isNaN(short_id))
            .map(([short_id, data]) => [short_id.toString().padStart(3, '0'), data] as [string,Row])
        )

        return Object.fromEntries(scan.map(scan => {
            const raw = scan.rawData || {}
            const id_short = raw?.StudentCode || ''
            const row = existing_data_dict[id_short]
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

    customized_common_data(data: Data) {
        const tabular: [string,string][] = []
        const cards: [string,string][] = []
        const fields = new Set(Object.keys(data))
     
        if (fields.has('info')) {
            cards.push(['informazioni', data['info']])
            fields.delete('info')
        }

        const field_mapping: Record<string, string> = {
            "Codice_meccanografico": "Codice",
            "Nome_scuola": "Scuola",
            "Città_scuola": "Città",
            "Distretto": "Distretto"
        }

        for (const key in field_mapping) {
            if (fields.has(key)) {
                tabular.push([field_mapping[key], data[key]])
                fields.delete(key)
            }
        }

        for (const field of fields) {
            tabular.push([field, data[field]])
        }

        return { tabular, cards }
    }    
}

function score_to_color_style(value: string): React.CSSProperties {
    const numericValue = parseFloat(value);
    return { backgroundColor: score_colors[Math.round(numericValue)] }
}

const score_colors = [
    "#bbd6ab", // 80
    "#bed8ab", // 79
    "#c0d7ab", // 78
    "#c2d8aa", // 77
    "#c3d9ab", // 76
    "#c5d8ab", // 75
    "#c6d9ab", // 74
    "#c7d8ab", // 73
    "#c9d9aa", // 72
    "#cadaa9", // 71
    "#ccdaa9", // 70
    "#cedaa8", // 69
    "#cfdba9", // 68
    "#d2dca8", // 67
    "#d2dca8", // 66
    "#d4dda8", // 65
    "#d6dda9", // 64
    "#d6dda7", // 63
    "#d7dea8", // 62
    "#dadfa7", // 61
    "#dbdea7", // 60
    "#dedfa6", // 59
    "#e0dfa6", // 58
    "#e0dfa6", // 57
    "#e2e0a5", // 56
    "#e2e0a4", // 55
    "#e5e0a6", // 54
    "#e7e1a5", // 53
    "#e7e1a5", // 52
    "#e8e2a4", // 51
    "#ece2a4", // 50
    "#ede1a4", // 49
    "#eee3a3", // 48
    "#efe4a4", // 47
    "#f2e4a5", // 46
    "#f3e5a4", // 45
    "#f4e5a2", // 44
    "#f7e5a3", // 43
    "#f9e6a2", // 42
    "#fae5a2", // 41
    "#fbe6a3", // 40
    "#f9e4a1", // 39
    "#f7e2a1", // 38
    "#f8e0a2", // 37
    "#f7dfa3", // 36
    "#f6dca1", // 35
    "#f5daa2", // 34
    "#f5d7a1", // 33
    "#f4d6a0", // 32
    "#f4d4a1", // 31
    "#f3d3a0", // 30
    "#f2d2a1", // 29
    "#f0d09f", // 28
    "#f0cea0", // 27
    "#f1cc9f", // 26
    "#efca9f", // 25
    "#eec99f", // 24
    "#eec7a0", // 23
    "#eec3a0", // 22
    "#edc29f", // 21
    "#ecc19e", // 20
    "#ebbe9d", // 19
    "#eabd9e", // 18
    "#e8bb9e", // 17
    "#e8b99d", // 16
    "#e9b79e", // 15
    "#e8b69d", // 14
    "#e5b49e", // 13
    "#e6b29d", // 12
    "#e5b09e", // 11
    "#e6af9b", // 10
    "#e5ad9c", // 9
    "#e4aa9c", // 8
    "#e3a99d", // 7
    "#e1a79c", // 6
    "#e0a69b", // 5
    "#e2a39c", // 4
    "#e0a19a", // 3
    "#e09f9b", // 2
    "#df9e9c", // 1
    "#de9d9b", // 0
    ].reverse();