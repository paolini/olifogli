export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_style: string // used in CSS
    editable: boolean
    widget: string // identify the HTML input widget
    alternativeNames: string[] // alternative names for CSV column matching
    required: boolean = true
    hidden: boolean = false
    numeric: boolean = false

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

    set_required() {
        this.required = true
        return this
    }

    set_optional() {
        this.required = false
        return this
    }

    set_hidden() {
        this.hidden = true
        return this
    }

    set_editable(editable: boolean) {
        this.editable = editable
        return this
    }

    set_numeric(numeric: boolean) {
        this.numeric = numeric
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

    csv(value: string): string {
        return value
    }
}

export class ChoiceAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-ChoiceAnswer`
        this.widget = 'ChoiceInput'
    }

    csv(value: string): string {
        return value ? value.charAt(0) : ''
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-NumericAnswer`
        this.widget = 'NumericInput'
        this.numeric = true
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, header?: string, alternativeNames?: string[]) {
        super(name, header, alternativeNames)
        this.css_style += ` field-ScoreAnswer`
        this.widget = 'ScoreInput'
        this.numeric = true
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
}
