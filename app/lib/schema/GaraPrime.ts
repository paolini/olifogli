import { Data, Row, ScanResults } from '../models'
import Competition from './Competition'
import { Field, ChoiceAnswerField, DateField, OptionsField, VariantField } from './fields'
import {decodePermutations, buildPermutationsObject, computeScores} from './PERMUTATIONS'
import { DerivedData } from './Schema'

function score_to_color_style(value: string): React.CSSProperties {
    const numericValue = parseFloat(value);
    // Definisci i colori in base al punteggio
    const minScore = 0;
    const maxScore = 90;
    const green = { r: 0, g: 200, b: 0 };
    const red = { r: 200, g: 0, b: 0 };
    function interpolateColor(color1: {r: number, g: number, b: number}, color2: {r: number, g: number, b: number}, factor: number) {
        const r = Math.round(color1.r + factor * (color2.r - color1.r));
        const g = Math.round(color1.g + factor * (color2.g - color1.g));
        const b = Math.round(color1.b + factor * (color2.b - color1.b));
        return { r, g, b };
    }
    return { backgroundColor: `rgb(${Object.values(interpolateColor(red, green, (numericValue - minScore) / (maxScore - minScore))).join(',')})` };
}

export default class GaraPrime extends Competition {
    constructor() {
        const expectedMinAge = 10
        const expectedMaxAge = 16
        super('gara_prime', "Gara delle prime", [
            new Field('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            new Field('surname',{header: "Cognome", titleCase: true}),
            new Field('name',{header: "Nome", titleCase: true}),
            new DateField('birthDate',{header: 'Data di nascita', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),
            new Field('codice_meccanografico',{header: 'Codice meccanografico'}),
            new Field('nome_scuola',{header: 'Scuola'}),
            new Field('città_scuola',{header: 'Città'}),
            new Field('classSection',{header:'Sezione', precompileValue: true}),
            new VariantField('variant',{header: "Codice compito", additionalCssStyle: 'thick-border-left'}),
            new ChoiceAnswerField('r01', {header: '1', additionalCssStyle: 'thick-border-left'}),
            new ChoiceAnswerField('r02', {header: '2'}),
            new ChoiceAnswerField('r03', {header: '3', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r04', {header: '4'}),
            new ChoiceAnswerField('r05', {header: '5'}),
            new ChoiceAnswerField('r06', {header: '6', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r07', {header: '7'}),
            new ChoiceAnswerField('r08', {header: '8'}),
            new ChoiceAnswerField('r09', {header: '9', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r10', {header: '10'}),
            new ChoiceAnswerField('r11', {header: '11'}),
            new ChoiceAnswerField('r12', {header: '12', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r13', {header: '13'}),
            new ChoiceAnswerField('r14', {header: '14'}),
            new ChoiceAnswerField('r15', {header: '15', additionalCssStyle: 'thick-border-right'}),
            new ChoiceAnswerField('r16', {header: '16'}),
            new ChoiceAnswerField('r17', {header: '17'}),
            new ChoiceAnswerField('r18', {header: '18', additionalCssStyle: 'thick-border-right'}),
            new Field('score', {header: 'Punti', type: 'number', editable: false, required: false, additionalCssStyle: 'thick-border-right', css_style: score_to_color_style}),
        ])
    }

    extractAnswerItems(data: Data) {
        const choice_fields = this.fields.filter(f => f instanceof ChoiceAnswerField)
        return choice_fields.map(f => ({
            name: f.name,
            answer: data[f.name] || ''
        }))
    }

    computeDerivedData(data: Data, sheetCommonData?: Data, workbookCommonData?: Data): DerivedData {
        const validated = super.computeDerivedData(data, sheetCommonData, workbookCommonData)
        // console.log("computeDerivedData",JSON.stringify({validated}))
        data = validated.data
        data = {...data, score:''}
        if (validated.error) return validated
        const anomalies = validated.anomalies
        const variant = data['variant'] || ''
        if (!variant) return {
            error: validated.error || 'codice compito mancante',
            data,
            anomalies,
        }
        const answer_items = this.extractAnswerItems(data)
        // console.log(JSON.stringify({answer_items}))
        try {
            const permutations = buildPermutationsObject(sheetCommonData, workbookCommonData);
            const {score, error, extended_answers} = decodePermutations(variant, answer_items.map(item => item.answer), permutations);
            // console.log(JSON.stringify({score,error,extended_answers}))
            data.score = `${score}`
            answer_items.forEach((item, i) => {
                data[item.name] = extended_answers[i] || ''
            })
            return {
                error: validated.error || error,
                data,
                anomalies,
            }
        } catch (e) {
            return {
                error: `errore di configurazione della raccolta: ${(e as Error).message}`,
                data,
                anomalies,
            }
        }
    }

    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string, {row: Row|undefined, data: Data}>> {
        throw new Error(`scan_to_data_dict not yet implemented`)
        const existing_data_dict = Object.fromEntries(rows
            .map(row => [parseInt(row.data.id), row] as [number,Row])
            .filter(([id,_]) => !isNaN(id))
            .map(([id, data]) => [id.toString().padStart(4, '0'), data] as [string,Row])
        )

        return Object.fromEntries(scan.map(scan => {
            // estraggo i dati dalla scansione
            const raw = scan.rawData || {}
            
            let {
                StudentCode,
                TestCode,
                StudentYear,
                Section,
            } = raw

            // pulisco i dati
            // le X sono usate per i campi non compilati
            StudentCode = (StudentCode || '').replaceAll('X','').trim().padStart(4,'0')
            Section = Section.replaceAll('X','').trim()
            TestCode = TestCode.replaceAll('X','').trim()
            StudentYear = StudentYear.replaceAll('X','').trim()

            // trova una eventuale riga già esistente
            const row = existing_data_dict[StudentCode]

            // riempi i dati in uscita
            const data: Data = {...(row?.data || {})}
            data.id = `${parseInt(StudentCode,10)}`
            if (TestCode) data['variant'] = TestCode
            if (StudentYear) data['classYear'] = `${parseInt(StudentYear,10)}`
            if (Section) data['classSection'] = Section
            this.fields.filter(field => field instanceof ChoiceAnswerField)
                .forEach((field,i) => {
                    data[field.name] = convert_answer(raw[`Answer${i+1}`]) || ''
                })
            return [scan._id,{row, data: this.clean(data)}]
        }))

        function convert_answer(s: string) {
            return {
                '': '-', // in realtà sembra non succeda mai: i campi vuoti diventano 'X' in ingresso
                'X': '-', // in ingresso la X viene messa sulle risposte vuote
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
            }[s] ?? 'X'
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
