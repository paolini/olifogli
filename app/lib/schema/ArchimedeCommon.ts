import { ReportEntry } from '@/app/graphql/generated'
import { Sheet } from '../models'
import { Data, Row, ScanResults } from '../models'
import Competition from './Competition'
import { Field, ChoiceAnswerField, DateField, OptionsField, VariantField, ScoreField, NumericField} from './fields'
import { ValidationContext } from './Context'

export default class ArchimedeCommon extends Competition {
    constructor(name: string, description: string, expectedMinAge: number=Number.NEGATIVE_INFINITY, expectedMaxAge: number=Number.POSITIVE_INFINITY) {
        super(name, description, [
            new NumericField('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            new Field('surname',{header: "Cognome", titleCase: true}),
            new Field('name',{header: "Nome", titleCase: true}),
            new DateField('birthDate',{header: 'Data di nascita', expectedMinAge: expectedMinAge, expectedMaxAge: expectedMaxAge}),
            new OptionsField('classYear', ['1','2','3','4','5'], {header:'Anno di corso', type: 'number', alternativeNames: ['anno'], precompileValue: true}),
            new Field('classSection',{header:'Sezione', precompileValue: true}),
            new VariantField('variant',{header: "Codice compito", additionalCssStyle: 'thick-border-left'}),
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
            new ScoreField('score', 80, {additionalCssStyle: 'thick-border-right'}),
        ])
        this.fields_to_be_copied_on_new_row = ['classYear', 'classSection']
        this.fields_to_be_ignored_on_inport = ['Nome concorrente', 'Email', 'ID utente', 'Genere', 'Codice fiscale', 'Ruolo', 'Verificato', 'Approvato/a', 'Approvato/a il', 'Idoneo/a', 'Codice meccanografico', 'Tipo scuola', 'Nome scuola', 'Città scuola', 'Provincia scuola', 'Sigla provincia scuola', 'Regione scuola', 'Email scuola', 'Data creazione membro'];
        this.fields_sensitive_names = ['surname', 'name']
        this.fields_sensitive_dates = ['birthDate']
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
            school: sheet.commonData?.Nome_scuola || '',
            city: sheet.commonData?.Città_scuola || '',
            district: sheet.commonData?.Distretto || '',
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

    validationContext(sheetCommonData: Data, workbookCommonData: Data): ValidationContext {
        const context = super.validationContext(sheetCommonData, workbookCommonData)
        const commonData = workbookCommonData
        
        // ATTENZIONE: internamente gli array sono 0-based
        // tranne correct che infatti usa le stringhe '2','3','4','5'.
    
        context.permutation_object = {
            correct: {},
            questions: {},
            answers: {},
            points: {
                correct: -Infinity,
                wrong: -Infinity,
                empty: -Infinity,
                invalid: -Infinity,
            }
        };
    
        let empty = true;
    
        for (const key in commonData) {
            if (key.startsWith('permutations_')) {
                empty = false;
                const value = commonData[key];
                const parts = key.split('_');
                if (parts.length > 3) {
                    throw new Error(`Invalid permutation key format: ${key}`);
                }
    
                const [, type, index] = parts;
    
                if (type === 'correct') {
                    context.permutation_object.correct[index || ''] = value;
                } else if (type === 'questions') {
                    const value_array = JSON.parse(value);
                    if (!Array.isArray(value_array)) {
                        throw new Error(`Permutation questions value for key "${key}" is not a valid array.`);
                    }
                    context.permutation_object.questions[index] = value_array;
                } else if (type === 'answers') {
                    context.permutation_object.answers[index] = value;
                } else if (type === 'points') {
                    const value_number = Number(value);
                    if (isNaN(value_number)) {
                        throw new Error(`Permutation points value for key "${key}" is not a valid number.`);
                    }
                    if (!(index in context.permutation_object.points)) {
                        throw new Error(`Unknown points index "${index}" in key "${key}"`);
                    }
                    context.permutation_object.points[index as keyof typeof context.permutation_object.points] = value_number;
    
                } else {
                    throw new Error(`Unknown permutation type "${type}" in key "${key}"`);
                }
            }
        }
    
        if (empty) {
            throw new Error(`Permutation object is empty, no keys starting with "permutations_" found in common data. Configurazione della raccolta errata?`);
        }

        const FIELD_NAME = "Codice_meccanografico"
        const schoolExternalId = sheetCommonData[FIELD_NAME]
        if (!schoolExternalId) throw new Error(`campo "${FIELD_NAME}" mancante nei dati della scuola`)
        context.school_external_id = (data: Data) => schoolExternalId

        return context;
    }
}
