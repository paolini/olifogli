import ArchimedeCommon from "./ArchimedeCommon"
import { OptionsField } from "./fields"

export default class ArchimedeBiennio extends ArchimedeCommon {
    constructor() {
        super('archimede_biennio', 'Archimede Biennio')
        this.header_essential = 'biennio'
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.options = ['1','2']})        
    }
}
