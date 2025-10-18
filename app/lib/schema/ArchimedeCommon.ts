import { Field, ChoiceAnswerField, ComputedField } from './fields'
import Schema from './Schema'

export default class ArchimedeCommon extends Schema {
    constructor(name: string, description: string) {
        super(name, description, [
            new Field('codiceCompito',"codice compito"),
            new Field('cognome'),
            new Field('nome'),
            new Field('dataNascita', 'data di nascita'),
            new Field('classe'),
            new Field('sezione'),
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
            new ComputedField('punti').add_css_style('thick-border-right'),
        ])
    }
}


