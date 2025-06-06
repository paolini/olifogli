export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_style: string // used in CSS
    editable: boolean
    widget: string // identify the HTML input widget

    constructor(name: string, header?: string) {
        this.name = name
        this.header = header || name
        this.css_style = `field-${this.name}`
        this.editable = true
        this.widget = 'Input'
    }

    add_css_style(style: string) {
        this.css_style += ` ${style}`
        return this
    }

    clean(value: string): string {
        return value.trim()
    }

    isValid(value: string): boolean {
        return value !== ""
    }
}
    
export class ComputedField extends Field {
    constructor(name: string) {
        super(name)
        this.editable = false
    }

    valueIsValid(_: string): boolean {
        return true
    }
}

export class ChoiceAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-ChoiceAnswer`
        this.widget = 'ChoiceInput'
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-NumericAnswer`
        this.widget = 'NumericInput'
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, header?: string) {
        super(name, header)
        this.css_style += ` field-ScoreAnswer`
        this.widget = 'ScoreInput'
    }
}
