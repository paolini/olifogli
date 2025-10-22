export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_style: string // used in CSS
    editable: boolean
    widget: string // identify the HTML input widget
    alternativeNames: string[] // alternative names for CSV column matching
    required: boolean = true

    constructor(name: string, header?: string, alternativeNames?: string[]) {
        this.name = name
        this.header = header || name
        this.css_style = `field-${this.name}`
        this.editable = true
        this.widget = 'Input'
        this.alternativeNames = alternativeNames || []
    }

    add_css_style(style: string) {
        this.css_style += ` ${style}`
        return this
    }

    // Get all possible names for this field (main name + alternatives)
    getAllNames(): string[] {
        return [this.name, this.header, ...this.alternativeNames]
    }

    clean(value: string): string {
        return value.trim()
    }

    isValid(value: string): boolean {
        return !this.required || value !== ''
    }
}
    
export class ComputedField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.editable = false
    }

    isValid(_: string): boolean {
        return true
    }
}

export class ChoiceAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-ChoiceAnswer`
        this.widget = 'ChoiceInput'
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-NumericAnswer`
        this.widget = 'NumericInput'
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-ScoreAnswer`
        this.widget = 'ScoreInput'
    }
}

export class DateField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-Date`
        this.widget = 'DateInput'
    }

    clean(value: string): string {
        // normalizza la data in formato gg/mm/aaaa
        value = value.trim()

        // se è nel formato yyyy-mm-dd la converte in dd/mm/yyyy
        const iso_date_match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (iso_date_match) {
            const year = iso_date_match[1]
            const month = iso_date_match[2]
            const day = iso_date_match[3]
            return `${day}/${month}/${year}`
        }

        // 0 padding delle singole cifre
        const parts = value.split('/').map(part => 
            part.length === 1
            ? '0' + part
            : part
        )

        // se l'anno ha due cifre, aggiunge il secolo 20
        if (parts.length === 3 && parts[2].length === 2) {
            parts[2] = '20' + parts[2]
        }

        return parts.join('/')
    }