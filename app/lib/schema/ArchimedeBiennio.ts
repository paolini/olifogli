import ArchimedeCommon from "./ArchimedeCommon"
import { OptionsField } from "./fields"

export default class ArchimedeBiennio extends ArchimedeCommon {
    constructor() {
        super('archimede-biennio', 'Archimede Biennio')
        this.fields.filter(f => f instanceof OptionsField)
            .forEach(f => {f.choices = ['1','2']})
    }

    sheet_title(sheet_name: string, workbook_name: string): string {
        return `${workbook_name} ‒ ${sheet_name} ‒ biennio`
    }
}
