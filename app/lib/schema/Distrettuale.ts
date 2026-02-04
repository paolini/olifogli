import { ReportEntry } from '@/app/graphql/generated'
import { Data, Row, ScanResults, Sheet } from '../models'
import { Field, ChoiceAnswerField, NumericAnswerField, ScoreAnswerField, NumericField, DateField, VariantField, ScoreField, OptionsField } from './fields'
import Schema, { RowToSheetsResult } from './Schema'
import CompetitionWithVariants from './CompetitionWithVariants'

const expectedMinAge = 10
const expectedMaxAge = 20

// campi in comune tra Distrettuale e ImportazioneDistrettuale
const common_fields = [
    new Field('surname',{header: "Cognome", titleCase: true}),
    new Field('name',{header: "Nome", titleCase: true}),
    new DateField('birthDate',{header: 'Data di nascita', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),
    new Field('codice_meccanografico',{header: 'Codice meccanografico'}),
    new Field('nome_scuola',{header: 'Scuola', hidden: true, required: false}),
    new Field('città_scuola',{header: 'Città', hidden: true, required: false}),
    new OptionsField('classYear', ['1','2','3','4','5'], {header:'Anno di corso', type: 'number', alternativeNames: ['anno', 'classe'], precompileValue: true}),
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
    new NumericAnswerField('r13', {header: '13'}),
    new NumericAnswerField('r14', {header: '14', additionalCssStyle: 'thick-border-right'}),
    new ScoreAnswerField('r15', {header: '15'}),
    new ScoreAnswerField('r16', {header: '16'}),
    new ScoreAnswerField('r17', {header: '17', additionalCssStyle: 'thick-border-right'}),
    new ScoreField('score', 115, {additionalCssStyle: 'thick-border-right'}),
]

export default class Distrettuale extends CompetitionWithVariants {
    constructor() {
        super('distrettuale', 'Distrettuale', [
            new NumericField('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            ...common_fields
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

export class ImportazionePartecipantiDistrettuale extends Schema {
    fields_to_be_ignored_on_inport: string[] = ["distretto", "ruolo", "approvato/a", "idoneo/a", "ID scuola", "Tipo Scuola", "indirizzo scuola", "CAP scuola", "Provincia scuola", "Sigla provincia scuola", "Regione scuola", "email scuola", "ID sede ufficiale", "Sede ufficiale", "ID sede di partecipazione", "Codice fiscale", "Qualificato", "Email", "Genere", "Punteggio totale", "Nome concorrente"]
    TargetSchema: Schema

    constructor() {
        super('importazione_partecipanti_distrettuale', 'Importazione Partecipanti Distrettuale', [
            new Field('distretto',{header: "Distretto", alternativeNames: ["Sede di partecipazione"]}),
            new NumericField('participant_id',{header: "participant_id", required: false, alternativeNames: ["ID partecipante"]}),
            new Field('surname_backup',{header: "Cognome (backup)", titleCase: true}),
            new Field('name_backup',{header: "Nome (backup)", titleCase: true}),
            new DateField('birthDate_backup',{header: 'Data di nascita (backup)', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),

            ...common_fields, // campi della gara distrettuale
        ])

        this.TargetSchema = new Distrettuale()
    }

    // estrae da una riga di questo schema i dati 
    // da usare per popolare la riga di un nuovo foglio
    // di uno schema diverso
    row_to_sheet = (row: Row): RowToSheetsResult | string => {
        const TargetSchema = this.TargetSchema
        const sheet_name = row.data['distretto'].replace('Distretto di ','').trim()
        if (!sheet_name) return "distretto non definito"
        const data = {...row.data}
        data['surname'] = data['surname'] || data['surname_backup'] || ''
        data['name'] = data['name'] || data['name_backup'] || ''
        data['birthDate'] = data['birthDate'] || data['birthDate_backup'] || ''
        const classYear = parseInt(data['classYear'],10)
        if (!isNaN(classYear) && (classYear >= 9)) {
            data['classYear'] = `${classYear-8}`
        }
        console.log("ImportazionePartecipantiDistrettuale.row_to_sheet:", {sheet_name, data})
        return {
            sheet:  {
                schema: TargetSchema.name,
                name: sheet_name,
            },
            row: {
                data: Object.fromEntries(common_fields.map(
                    field => [field.name, data[field.name] || '']
                )),
                unique_keys: ['surname','name','birthDate'],
            }
        }
    }
}

export class Distretti extends Schema {
    TargetSchema: Schema = new Distrettuale()

    constructor() {
        const fields_to_be_ignored_on_inport = ['user.phoneNumber', 'school.address']
        super('distretti', 'Distretti', [
            new Field("distretto", {alternativeNames: ["zone"]}),
            new Field("id_distretto", {alternativeNames: ["zone_id"]}),
            new Field("cd", {alternativeNames: ["isPrimary"]}),
            new Field("nome", {alternativeNames: ["name"]}),
            new Field("cognome", {alternativeNames: ["surname"]}),
            new Field("email"),
            new Field("school_name", {alternativeNames: ["school.name"]}),
            new Field("school_city", {alternativeNames: ["school.city"]}),
        ])
    }

    row_to_sheet = (row: Row): RowToSheetsResult|string => {
        const TargetSchema = this.TargetSchema
        const sheet_name = row.data['distretto'].replace('Distretto di ','').trim()
        const isPrimary = row.data['cd'] && row.data['cd'] === '1'
        if (!sheet_name) return "distretto non definito"

        return {
            sheet: {
                schema: TargetSchema.name,
                name: sheet_name,
                permissions: [{
                    email: row.data['email'],
                    role: isPrimary ? 'admin' : 'editor',
                }],
                data: {
                    _id_distretto: row.data['id_distretto'],
                    _referente: `${row.data['nome']} ${row.data['cognome']}`,
                }
            }
        }
    }
}
