import ArchimedeCommon from './ArchimedeCommon'
import { OptionsField } from './fields'

export default class ArchimedeTriennio extends ArchimedeCommon  {
    constructor() {
        super('archimede-triennio', 'Archimede Triennio')   
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.choices = ['3','4','5']})
        }
}