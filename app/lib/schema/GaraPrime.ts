import { ReportEntry } from '@/app/graphql/generated'
import { Data, Row, ScanResults, Sheet } from '../models'
import CompetitionWithVariants from './CompetitionWithVariants'
import { Field, ChoiceAnswerField, DateField, VariantField, ScoreField, NumericField } from './fields'

export default class GaraPrime extends CompetitionWithVariants {
    constructor() {
        const expectedMinAge = 10
        const expectedMaxAge = 16
        super('gara_prime', "Gara delle prime", [
            new NumericField('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            new Field('surname',{header: "Cognome", titleCase: true}),
            new Field('name',{header: "Nome", titleCase: true}),
            new DateField('birthDate',{header: 'Data di nascita', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),
            new Field('codice_meccanografico',{header: 'Codice meccanografico'}),
            new Field('nome_scuola',{header: 'Scuola', hidden: true, required: false}),
            new Field('città_scuola',{header: 'Città', hidden: true, required: false}),
            new Field('classSection',{header:'Sezione', precompileValue: true}),
            new VariantField('variant',{header: "Codice compito (0 se assente)", additionalCssStyle: 'thick-border-left'}),
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
            new ScoreField('score', 90, {additionalCssStyle: 'thick-border-right'}),
        ])
    }

    scans_to_data_dict(scan: ScanResults[], rows: Row[]): Partial<Record<string, {row: Row|undefined, data: Data}>> {
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
            Section = (Section || '').replaceAll('X','').trim()
            TestCode = (TestCode || '').replaceAll('X','').trim()
            StudentYear = (StudentYear || '').replaceAll('X','').trim()

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

    extract_ranking = (row: Row, sheet: Sheet): ReportEntry | undefined => {
        // Estrai il punteggio dal campo 'score'
        const scoreValue = row.data?.score
        if (!scoreValue) return
        let score: number = parseFloat(scoreValue)
        if (isNaN(score)) score = 0

        return {
            sheetId: row.sheetId,
            sheetName: sheet.name,
            studentName: row.data?.name || '',
            studentSurname: row.data?.surname || '',
            studentBirthDate: row.data?.birthDate || '',
            school: row.data?.nome_scuola || '',
            city: row.data?.città_scuola || '',
            district: sheet.name || '',
            classYear: '1',
            classSection: row.data?.classSection || '',
            score,
            rowId: row._id,
            selections: row.selections || [],
            participantId: row.olimanager?.participantId,
            rank: 0, // Verrà calcolato dopo
            sheet: sheet,
        }
    }
}
