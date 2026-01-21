import { Data } from "../models";
import Competition from "./Competition";
import { ChoiceAnswerField, Field } from "./fields";
import { buildPermutationsObject, decodePermutations } from "./PERMUTATIONS";
import { DerivedData } from "./Schema";

export default class CompetitionWithVariants extends Competition {
    constructor(name: string, header: string, fields: Field[]) {
        super(name, header, fields)
        if (!this.fields.find(f => f.name === 'variant')) {
            throw new Error("CompetitionWithVariants requires a 'variant' field")
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
        const variant = data['variant'] || ''
        if (!variant) return {
            error: validated.error || 'codice compito mancante',
            data,
            anomalies,
        }
        if (variant === '000' || variant === '0') return {
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
    
}