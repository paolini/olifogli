import { Data } from '../models'
import { Field, ChoiceAnswerField, ComputedField, DateField } from './fields'
import decodePermutations from './PERMUTATIONS'
import Schema, { DerivedData } from './Schema'

export default class ArchimedeCommon extends Schema {
    constructor(name: string, description: string) {
        super(name, description, [
            new Field('id',"codice studente",["ID concorrente"]).set_hidden().set_optional(),
            new Field('variant',"codice compito"),
            new Field('surname', "cognome"),
            new Field('name', "nome"),
            new DateField('birthDate', 'data di nascita'),
            new Field('classYear','classe'),
            new Field('classSection','sezione'),
            new ChoiceAnswerField('r01', '1').add_css_style('thick-border-left'),
            new ChoiceAnswerField('r02', '2'),
            new ChoiceAnswerField('r03', '3'),
            new ChoiceAnswerField('r04', '4').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r05', '5'),
            new ChoiceAnswerField('r06', '6'),
            new ChoiceAnswerField('r07', '7'),
            new ChoiceAnswerField('r08', '8').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r09', '9'),
            new ChoiceAnswerField('r10', '10'),
            new ChoiceAnswerField('r11', '11'),
            new ChoiceAnswerField('r12', '12').add_css_style('thick-border-right'),
            new ChoiceAnswerField('r13', '13'),
            new ChoiceAnswerField('r14', '14'),
            new ChoiceAnswerField('r15', '15'),
            new ChoiceAnswerField('r16', '16').add_css_style('thick-border-right'),
            new ComputedField('score', 'punti').add_css_style('thick-border-right'),
        ])
        this.fields_to_be_copied_on_new_row = ['classYear', 'classSection']
        this.fields_to_be_ignored_on_inport = ['Nome concorrente', 'Email', 'ID utente', 'Genere', 'Codice fiscale', 'Ruolo', 'Verificato', 'Approvato/a', 'Approvato/a il', 'Idoneo/a', 'Codice meccanografico', 'Tipo scuola', 'Nome scuola', 'Città scuola', 'Provincia scuola', 'Sigla provincia scuola', 'Regione scuola', 'Email scuola', 'Data creazione membro'];

    }

    computeDerivedData(data: Data): DerivedData {
        const validated = super.computeDerivedData(data)
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
        const {score, error, extended_answers} = decodePermutations(variant, answers);
        data.score = `${score}`
        choice_fields.forEach((f, i) => {
            data[f.name] = extended_answers[i] || ''
        })
        return {
            error,
            data
        }
    }
}


