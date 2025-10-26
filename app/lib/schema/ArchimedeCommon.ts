import { Data } from '../models'
import { Field, ChoiceAnswerField, DateField, OptionsField } from './fields'
import {decodePermutations, buildPermutationsObject} from './PERMUTATIONS'
import Schema, { DerivedData } from './Schema'

export default class ArchimedeCommon extends Schema {
    constructor(name: string, description: string) {
        super(name, description, [
            new Field('id',{header: "codice studente", alternativeNames: ["ID concorrente"], hidden: true, required: false}),
            new Field('surname',{header: "cognome"}),
            new Field('name',{header: "nome"}),
            new DateField('birthDate',{header: 'data di nascita'}),
            new OptionsField('classYear', ['1','2','3','4','5'], {header:'anno di corso', numeric: true, alternativeNames: ['anno']}),
            new Field('classSection',{header:'sezione'}),
            new Field('variant',{header: "codice compito", additionalCssStyle: 'thick-border-left'}),
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
            new Field('score', {header: 'punti', numeric: true, editable: false, required: false, additionalCssStyle: 'thick-border-right'}),
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
}


