import { CSSProperties } from "react"

type FieldOptions = {
    header?: string
    alternativeNames?: string[]
    css_class?: string
    css_style?: CSSProperties|((value:string)=>CSSProperties)
    editable?: boolean
    widget?: string
    additionalCssStyle?: string
    hidden?: boolean
    required?: boolean
    numeric?: boolean
}

export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_class: string // used in CSS
    css_style: undefined | CSSProperties | ((value: string) => CSSProperties)
    editable: boolean
    widget: string // identify the HTML input widget
    alternativeNames: string[] // alternative names for CSV column matching
    required: boolean = true
    hidden: boolean = false
    numeric: boolean = false

    constructor(name: string, {header, editable, widget, alternativeNames, additionalCssStyle, css_style, hidden, required, numeric}: FieldOptions = {}) {
        this.name = name
        this.header = header || name
        this.css_class = `field-${this.name}`
        if (additionalCssStyle) {
            this.css_class += ` ${additionalCssStyle}`
        }
        this.css_style = css_style || undefined
        this.editable = editable !== undefined ? editable : true
        this.alternativeNames = alternativeNames || []
        this.widget = widget || 'Input'
        this.hidden = hidden !== undefined ? hidden : this.hidden
        this.required = required !== undefined ? required : true
        this.numeric = numeric !== undefined ? numeric : false
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

    csv(value: string): string {
        return value
    }

    compare(value1: string, value2: string): number {
        if (this.numeric) {
            const n1 = parseFloat(value1)
            const n2 = parseFloat(value2)
            return ((n1 > n2) ? 1 : (n1 < n2) ? -1 : 0)
        } else {
            const v1 = value1.toLowerCase()
            const v2 = value2.toLowerCase()
            return ((v1 > v2) ? 1 : (v1 < v2) ? -1 : 0)
        }
    }
}

export class OptionsField extends Field {
    choices: string[]
    constructor(name: string, choices: string[], options: FieldOptions = {}) {
        super(name, options) 
        this.choices = choices
    }

    isValid(value: string): boolean {
        if (!super.isValid(value)) return false
        if (value === '') return true // non richiesto e vuoto
        return this.choices.includes(value)
    }
}


export class ChoiceAnswerField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-ChoiceAnswer`
        this.widget = 'ChoiceInput'
    }

    csv(value: string): string {
        return value ? value.charAt(0) : ''
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-NumericAnswer`
        this.widget = 'NumericInput'
        this.numeric = true
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-ScoreAnswer`
        this.widget = 'ScoreInput'
        this.numeric = true
    }
}

export class DateField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-Date`
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

    isValid(value: string): boolean {
        // se non è richiesto e il valore è vuoto, è valido
        if (!this.required && value === '') return true
        
        // deve essere della forma gg/mm/yyyy ed estrae i valori
        const match = value.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/)
        if (!match) return false

        const day = parseInt(match[1], 10)
        const month = parseInt(match[2], 10)
        const year = parseInt(match[3], 10)
        
        // Verifica che il giorno sia valido per il mese/anno
        const date = new Date(year, month - 1, day)
        
        // Verifica che la data creata corrisponda ai valori inseriti
        // (questo gestisce automaticamente anni bisestili e giorni per mese)
        if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
            return false
        }
        return true;
    }

    compare(value1: string, value2: string): number {
        const v1 = value1.length === 10 
            ? `${value1.substring(6,10)}-${value1.substring(3,5)}-${value1.substring(0,2)}` 
            : value1;
        const v2 = value2.length === 10 
            ? `${value2.substring(6,10)}-${value2.substring(3,5)}-${value2.substring(0,2)}` 
            : value2;
        return (
            (v1 > v2) ? 1 :
            (v1 < v2) ? -1 : 0
        )
    }
}
