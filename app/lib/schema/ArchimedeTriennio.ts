import ArchimedeCommon from './ArchimedeCommon'
import { OptionsField } from './fields'

export default class ArchimedeTriennio extends ArchimedeCommon  {
    constructor() {
        super('archimede_triennio', 'Archimede Triennio', 12, 20)   
        this.header_essential = 'triennio'
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.choices = ['3','4','5']})
        }
}