import { ReportEntry } from '@/app/graphql/generated'
import { Data, Row, ScanResults, Sheet } from '../models'
import { Field, ChoiceAnswerField, NumericAnswerField, ScoreAnswerField, NumericField, DateField, VariantField, ScoreField, OptionsField, AbsentField, AnswerField } from './fields'
import Schema, { RowToSheetsResult, RowCalculationResult } from './Schema'
import Competition from './Competition'
import { ValidationContext } from './Context'

const expectedMinAge = 10
const expectedMaxAge = 20

// campi in comune tra Distrettuale e ImportazioneDistrettuale
const common_fields = [
    new Field('surname',{header: "Cognome", titleCase: true}),
    new Field('name',{header: "Nome", titleCase: true}),
    new DateField('birthDate',{header: 'Data di nascita', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),
    new Field('codice_meccanografico',{header: 'Codice meccanografico', upperCase: true}),
    new Field('nome_scuola',{header: 'Scuola', hidden: true, required: false}),
    new Field('città_scuola',{header: 'Città', hidden: true, required: false}),
    new OptionsField('classYear', ['1','2','3','4','5'], {header:'Anno di corso', type: 'number', alternativeNames: ['anno', 'classe'], precompileValue: true}),
    new Field('classSection',{header:'Sezione', precompileValue: true}),
    new OptionsField('shirt_size', ['S','M','L','XL'], {header:'taglia', upperCase: true, required: false}),
    new AbsentField('absent',{header: "1=assente", additionalCssStyle: 'thick-border-left'}),
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

export default class Distrettuale extends Competition {
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

            const {
                ShirtSize,
                Gender,
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
            if (ShirtSize) data['shirt_size'] = ShirtSize
            if (Gender) data['gender'] = Gender
            this.fields.filter(field => field instanceof ChoiceAnswerField)
                .forEach((field,i) => {
                    data[field.name] = convert_answer(raw[`Answer${i+1}`]) || ''
                })
            
            // Gestione NumericAnswerField e ScoreAnswerField (se presenti nella scansione come AnswerN)
            // Assumiamo che la scansione popoli Answer13, Answer14 etc.
            // Bisogna vedere come sono mappati nell'oggetto raw.
            // Per ora manteniamo la logica esistente per ChoiceAnswerField e aggiungiamo gli altri se necessario
            // Ma scans_to_data_dict mappava solo ChoiceAnswerField nel codice precedente.
            // Se le risposte 13-17 arrivano dalla scansione, dobbiamo mapparle.
            // Le domande numeriche (13,14) potrebbero arrivare nella scansione.
            // Le domande score (15,16,17) arrivano dalla scansione o inserimento manuale dopo?
            // Se arrivano dalla scansione, aggiungiamo il mapping.
            
            const otherFields = this.fields.filter(field => field instanceof NumericAnswerField || field instanceof ScoreAnswerField);
            otherFields.forEach((field) => {
                // Estraiamo il numero dalla parte "rXX" del nome
                const match = field.name.match(/r(\d+)/);
                if (match) {
                    const index = parseInt(match[1]);
                    const key = `Answer${index}`;
                    if (raw[key]) {
                        data[field.name] = raw[key].replaceAll('X','').trim(); 
                    }
                }
            });

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

    validationContext(sheet_data: Data, workbook_data: Data): ValidationContext {
        const context = super.validationContext(sheet_data, workbook_data)
        const raw = workbook_data['correct_answers'] || ''
        if (!raw) return context

        context.answers_object = {
            correct: {},
            points: {
                correct: parseFloat(workbook_data['points_correct'] || '0'),
                wrong: parseFloat(workbook_data['points_wrong'] || '0'),
                empty: parseFloat(workbook_data['points_empty'] || '0'),
                invalid: parseFloat(workbook_data['points_invalid'] || '0'),
            }
        }

        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const correct = context.answers_object.correct;
                const answerFields = this.fields.filter(f => f instanceof AnswerField);
                parsed.forEach((val, i) => {
                    if (answerFields[i]) correct[answerFields[i].name] = String(val);
                });
            } else {
                throw new Error(`correct_answers deve essere un array JSON (es. ["A", "B", ...])`);
            }
        } catch (e) {
            throw new Error(`Errore nel parsing JSON di correct_answers: ${(e as Error).message}`);
        }

        const FIELD_NAME = "codice_meccanografico"
        context.school_external_id = (data: Data) => (data[FIELD_NAME] || '')

        return context;
    }

    protected calculateRowData(data: Data, context: ValidationContext): RowCalculationResult {
        // Parsing delle risposte corrette da 'correct_answers' se presente
        const correctAnswersMap: Record<string, string> = {};

        function error(msg: string) {
            return {
                totalScore: undefined,
                problemScores: [],
                processedAnswers: {},
                error: msg
            }
        }

        if (!context.answers_object) {
            return error('risposte corrette non configurate')
        }

        const points = context.answers_object.points;
        let totalScore = 0
        const problemScores: number[] = []
        const processedAnswers: Record<string, string> = {}

        // Iterate fields
        for(const field of this.fields) {
            if (!(field instanceof AnswerField)) continue;
            let answer = data[field.name] || '';

            // Pulisci l'eventuale formato esteso se già presente
            // Per ChoiceAnswerField il formato è "RISPOSTA [PERMUTAZIONE]" es "A [CAC]"
            // Per NumericAnswerField il formato è "RISPOSTA [CORRETTA]" es "12 [10]"
            const formatMatch = answer.match(/^(.*)\s\[.*\]$/);
            if (formatMatch) {
                answer = formatMatch[1];
            }

            let score = 0;
            let extendedAnswer = answer;
            const correctAnswer = context.answers_object.correct[field.name];
                        
            if (field instanceof ChoiceAnswerField) {
                // Valutazione
                if (answer === 'X') {
                    score = points.invalid;
                } else if (answer === '-') {
                    score = points.empty;
                } else if (answer === correctAnswer) {
                    score = points.correct;
                } else {
                    score = points.wrong;
                }
                extendedAnswer = `${answer} [${correctAnswer}]`;
            } else if (field instanceof NumericAnswerField) {
                if (answer === '-') {
                    score = points.empty;
                } else if (answer === correctAnswer) {
                    score = points.correct;
                } else {
                    score = points.wrong;
                }
                extendedAnswer = `${answer} [${correctAnswer}]`;
            } else if (field instanceof ScoreAnswerField) {
                if (answer === '-' || answer === '' || answer === 'X') {
                    score = 0;
                } else {
                    score = parseFloat(answer);
                    if (isNaN(score) || score < 0 || score > 15) {
                        return error(`risposta non valida per campo ${field.header}: "${answer}"`);
                    }
                }
            } else {
                throw new Error(`Tipo di campo non supportato in calculateRowData: ${field.constructor.name}`);
            }
            
            problemScores.push(score);
            console.log(`Campo ${field.name}: risposta="${answer}", corretta="${correctAnswer}", score=${score}`);
            totalScore += score;
            console.log(`Total score parziale: ${totalScore}`);
            processedAnswers[field.name] = extendedAnswer;
        }

        if (problemScores.length !== Object.keys(context.answers_object.correct).length) {
            console.log("Mismatch tra numero di risposte corrette e numero di campi di risposta:", {
                problemScoresLength: problemScores.length,
                correctAnswersLength: Object.keys(context.answers_object.correct).length,
                problemScores,
                correctAnswers: context.answers_object.correct,
            });
            return error(`il numero di risposte corrette configurate (${Object.keys(context.answers_object.correct).length}) non corrisponde al numero di risposte presenti nello schema (${problemScores.length})`);
        }

        const ret = {
            totalScore: totalScore,
            problemScores,
            processedAnswers,
            error: ''
        }
        console.log("calculateRowData:", ret)
        return ret
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
            classYear: row.data?.classYear || '',
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
                olimanager: {
                    participantId: row.data['participant_id'] ? `${row.data['participant_id']}` : undefined,
                },
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
