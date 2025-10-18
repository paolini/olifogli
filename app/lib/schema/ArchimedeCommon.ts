import { Field, ChoiceAnswerField, ComputedField } from './fields'
import Schema from './Schema'

export default class ArchimedeCommon extends Schema {
    constructor(name: string, description: string) {
        super(name, description, [
            new Field('variant',"codice compito"),
            new Field('surname'),
            new Field('name'),
            new Field('birthDate', 'data di nascita'),
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
    }
}


