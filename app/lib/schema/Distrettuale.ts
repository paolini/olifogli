import { Field, ChoiceAnswerField, NumericAnswerField, ScoreAnswerField } from './fields'
import Schema from './Schema'

export default class Distrettuale extends Schema {
    constructor() {
        super('distrettuale', 'Distrettuale', [
            new Field('cognome'),
            new Field('nome'),
            new Field('classe'),
            new Field('sezione'),
            new Field('scuola'),
            new ChoiceAnswerField('r01', {header: '1'}),
            new ChoiceAnswerField('r02', {header: '2'}),
            new ChoiceAnswerField('r03', {header: '3'}),
            new ChoiceAnswerField('r04', {header: '4'}),
            new ChoiceAnswerField('r05', {header: '5'}),
            new ChoiceAnswerField('r06', {header: '6'}),
            new ChoiceAnswerField('r07', {header: '7'}),
            new ChoiceAnswerField('r08', {header: '8'}),
            new ChoiceAnswerField('r09', {header: '9'}),
            new ChoiceAnswerField('r10', {header: '10'}),
            new ChoiceAnswerField('r11', {header: '11'}),
            new ChoiceAnswerField('r12', {header: '12'}),
            new NumericAnswerField('r13', {header: '13'}),
            new NumericAnswerField('r14', {header: '14'}),
            new ScoreAnswerField('r15', {header: '15'}),
            new ScoreAnswerField('r16', {header: '16'}),
            new ScoreAnswerField('r17', {header: '17'}),
        ])
    }
}
