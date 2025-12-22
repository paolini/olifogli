import ArchimedeCommon from "./ArchimedeCommon"
import { OptionsField } from "./fields"

export default class ArchimedeBiennio extends ArchimedeCommon {
    constructor() {
        super('archimede_biennio', 'Archimede Biennio', 10, 18)
        this.header_essential = 'biennio'
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.options = ['1','2']})        
        this.selections = [
            { label: "gara_prime", name: "Gara delle prime", color: "gold" }
        ]
    }
}
