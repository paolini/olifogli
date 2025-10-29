import ArchimedeCommon from "./ArchimedeCommon"
import { OptionsField } from "./fields"

export default class ArchimedeBiennio extends ArchimedeCommon {
    constructor() {
        super('archimede-biennio', 'Archimede Biennio')
        this.header_essential = 'biennio'
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.choices = ['1','2']})        
    }
}
