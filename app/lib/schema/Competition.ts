import { Data, Row } from "../models";
import { AbsentField, ChoiceAnswerField, Field, VariantField } from "./fields";
import { buildPermutationsObject, decodePermutations, computeScoresWithVariants } from "./PERMUTATIONS";
import Schema, { DerivedData, OlimanagerProblemResult } from "./Schema";

export default class Competition extends Schema {
    variant_field: string = '';
    absent_field: string = '';

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

    computeDerivedData(data: Data, sheetCommonData?: Data, workbookCommonData?: Data): DerivedData {
        const validated = super.computeDerivedData(data, sheetCommonData, workbookCommonData)
        data = validated.data
        data = {...data, score:''}
        if (validated.error) return validated
        const anomalies = validated.anomalies
        const variant_field = this.variant_field
        const absent_field = this.absent_field
        const variant = data[variant_field] || ''
        const absent = data[absent_field] || ''

        if (variant_field && !variant) return {
            error: validated.error || 'codice compito mancante',
            data,
            anomalies,
        }
        if (variant === '000' || variant === '0' || absent === '1') return {
            error: '',
            data,
            anomalies,
        }
        const answer_items = this.extractAnswerItems(data)
        try {
            const permutations = buildPermutationsObject(sheetCommonData, workbookCommonData);
            const {score, error, extended_answers} = decodePermutations(variant, answer_items.map(item => item.answer), permutations);
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

    extract_olimanager_results = (
        row: Row, sheetData: Data, workbookData: Data
    ): OlimanagerProblemResult[] => {
        const variant = row.data['variant'];
        if (variant === '0' || variant === '000') {
            return [];
        }

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

        const scores = computeScoresWithVariants(answer_items.map(item => item.answer), permutation_data);

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
