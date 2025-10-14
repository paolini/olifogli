import { Field, ChoiceAnswerField, ComputedField } from './fields'
import Schema from './Schema'

export default class ArchimedeBiennio extends Schema {
    constructor() {
        super('archimede-biennio', 'Archimede Biennio', [
            new Field('codice'),
            new Field('cognome'),
            new Field('nome'),
            new Field('dataNascita', 'data di nascita'),
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
            new ComputedField('punti'),
        ])
    }
}
