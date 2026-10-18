import { Data, Row } from "../models";
import { ValidationContext } from "./Context";
import { AbsentField, AnswerField, ChoiceAnswerField, Field, VariantField } from "./fields";
import { decodePermutations, computeScoresWithVariants } from "./PERMUTATIONS";
import Schema, { DerivedData, OlimanagerProblemResult, RowCalculationResult } from "./Schema";

export default class Competition extends Schema {
    constructor(name: string, header: string, fields: Field[]) {
        super(name, header, fields)
        for (const field of fields) {
            if (field instanceof VariantField) {
                if (this.variant_field) throw new Error("Multiple variant fields defined")
                this.variant_field = field.name
            }
            if (field instanceof AbsentField) {
                if (this.absent_field) throw new Error("Multiple absent fields defined")
                this.absent_field = field.name
            }
        }
    }
    
    extractAnswerItems(data: Data) {
        const choice_fields = this.fields.filter(f => f instanceof ChoiceAnswerField)
        return choice_fields.map(f => ({
            name: f.name,
            answer: data[f.name] || ''
        }))
    }

    protected calculateRowData(data: Data, context: ValidationContext): RowCalculationResult {
        const variant_field = this.variant_field
        const variant = data[variant_field] || ''
        
        if (variant_field && !variant) {
            return {
                totalScore: 0,
                problemScores: [],
                processedAnswers: {},
                error: 'codice compito mancante'
            }
        }

        const answer_items = this.extractAnswerItems(data)
        try {
            const permutations = context.permutation_object
            if (!permutations) throw new Error("permutation_object mancante nel context, configurazione della raccolta errata?")
            const {score, error, extended_answers} = decodePermutations(variant, answer_items.map(item => item.answer), permutations);
            
            if (error) {
                return {
                    totalScore: 0,
                    problemScores: [],
                    processedAnswers: {},
                    error
                }
            }

            const processedAnswers: Record<string,string> = {}
            answer_items.forEach((item, i) => {
                processedAnswers[item.name] = extended_answers[i] || ''
            })
            
            // Re-compute scores to get individual problem scores
            // Note: decodePermutations already verifies score consistency, so we can trust extended_answers
            const problemScores = computeScoresWithVariants(extended_answers, permutations);

            return {
                totalScore: score,
                problemScores,
                processedAnswers,
                error: ''
            }
        } catch (e) {
            return {
                totalScore: 0,
                problemScores: [],
                processedAnswers: {},
                error: `errore di configurazione della raccolta: ${(e as Error).message}`
            }
        }
    }

    affectsScore(fieldName: string): boolean {
        return this.fields.some(field => field.name === fieldName &&
            (field instanceof AnswerField || field instanceof VariantField || field instanceof AbsentField))
    }

    computeDerivedData(data: Data, context: ValidationContext): DerivedData {
        const validated = super.computeDerivedData(data, context)
        data = validated.data
        data = {...data, score:''}
        
        const anomalies = validated.anomalies
        const absent = context.absent(data)

        // Gestione assenze/varianti speciali (non chiamano calculateRowData)
        if (absent) {
            return {
                error: validated.error,
                data,
                anomalies,
            }
        }

        // Score validity depends on answers and variant, independently of identity fields.
        const rowContext = { absent, context }
        for (const field of this.fields.filter(field => this.affectsScore(field.name))) {
            if (field instanceof ChoiceAnswerField && !/^[ABCDEX-]$/.test(field.display(data[field.name] || '', '', false).value)) {
                return { ...validated, data, error: validated.error || `risposta non valida: ${field.header}` }
            }
            const error = field.checkValid(data[field.name] || '', rowContext)
            if (error) return { ...validated, data, error: validated.error || error }
        }
        const result = this.calculateRowData(data, context);
        
        if (result.error) {
            return {
                error: validated.error || result.error,
                data,
                anomalies
            }
        }

        data.score = `${result.totalScore}`
        Object.assign(data, result.processedAnswers);

        return {
            error: validated.error || '',
            data,
            anomalies
        }
    }   

    extract_olimanager_results = (row: Row, context: ValidationContext): OlimanagerProblemResult[] => {
        if (context.absent(row.data)) {
            return [];
        }

        /*
        const variant = row.data['variant'];
        // TODO: generalizzare il controllo su "variant" che potrebbe non esistere
        if (variant === '0' || variant === '000') {
            return [];
        }
        */

        if (isNaN(context.contest_id)) {
            throw new Error(`contest_id non configurato`);
        }

        if (!row.olimanager || !row.olimanager.participantId) {
            throw new Error(`participantId mancante per la riga ${row._id}`);
        }

        const participantId = parseInt(row.olimanager.participantId);
        if (isNaN(participantId)) {
            throw new Error(`participantId non valido per la riga ${row._id}: ${row.olimanager.participantId}`);
        }

        const result = this.calculateRowData(row.data, context);
        if (result.error) {
            throw new Error(result.error);
        }

        const problemResults = result.problemScores.map((score, index) => ({
            participantId: participantId,
            problemIndex: index+1,
            score: score,
            disqualified: false
        }));

        // check length consistency if needed?
        // In previous code: if (problemResults.length !== answer_items.length) ...
        // Here we trust calculateRowData returns correct number of scores.

        return problemResults;
    }
}
