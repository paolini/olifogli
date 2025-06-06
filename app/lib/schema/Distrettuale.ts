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
            new ChoiceAnswerField('r01', '1'),
            new ChoiceAnswerField('r02', '2'),
            new ChoiceAnswerField('r03', '3'),
            new ChoiceAnswerField('r04', '4'),
            new ChoiceAnswerField('r05', '5'),
            new ChoiceAnswerField('r06', '6'),
            new ChoiceAnswerField('r07', '7'),
            new ChoiceAnswerField('r08', '8'),
            new ChoiceAnswerField('r09', '9'),
            new ChoiceAnswerField('r10', '10'),
            new ChoiceAnswerField('r11', '11'),
            new ChoiceAnswerField('r12', '12'),
            new NumericAnswerField('r13', '13'),
            new NumericAnswerField('r14', '14'),
            new ScoreAnswerField('r15', '15'),
            new ScoreAnswerField('r16', '16'),
            new ScoreAnswerField('r17', '17'),
        ])
    }
}
