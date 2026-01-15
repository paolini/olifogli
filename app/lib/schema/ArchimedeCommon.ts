import { Data, Row, ScanResults } from '../models'
import { OlimanagerProblemResult } from './Competition'
import CompetitionWithVariants from './CompetitionWithVariants'
import { Field, ChoiceAnswerField, DateField, OptionsField, VariantField, ScoreField } from './fields'
import { buildPermutationsObject, computeScores} from './PERMUTATIONS'

export default class ArchimedeCommon extends CompetitionWithVariants {
    constructor(name: string, description: string, expectedMinAge: number=Number.NEGATIVE_INFINITY, expectedMaxAge: number=Number.POSITIVE_INFINITY) {
        super(name, description, [
            new Field('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
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

    get_school_external_id(data: Data): string {
        const FIELD_NAME = "Codice_meccanografico"
        const schoolExternalId = data[FIELD_NAME]
        if (!schoolExternalId) throw new Error(`campo "${FIELD_NAME}" mancante nei dati della scuola`)
        return schoolExternalId
    }

    extract_olimanager_results(
      row: Row, sheetData: Data, workbookData: Data
    ): OlimanagerProblemResult[] {
        const contestId = this.get_contest_id(workbookData);

        if (!row.olimanager || !row.olimanager.participantId) {
            throw new Error(`participantId mancante per la riga ${row._id}`);
        }

        const participantId = parseInt(row.olimanager.participantId);

        if (isNaN(participantId)) {
            throw new Error(`participantId non valido per la riga ${row._id}: ${row.olimanager.participantId}`);
        }

        const answer_items = this.extractAnswerItems(row.data);
        const permutation_data = buildPermutationsObject(sheetData, workbookData);

        const scores = computeScores(answer_items.map(item => item.answer), permutation_data);

        const problemResults = scores.map((score, index) => ({
            participantId: participantId,
            problemIndex: index+1,
            score: score,
            disqualified: false
        }));

        if (problemResults.length !== answer_items.length) {
            throw new Error(`Numero di risultati problema non valido per la riga ${row._id}: attesi ${answer_items.length}, trovati ${problemResults.length}`);
        }

        return problemResults;
    }
}
