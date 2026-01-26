import { __EnumValue } from "graphql"
import { CSSProperties } from "react"
import { Data } from "../models"

type FieldType = 'text' | 'number' | 'date' | 'choice-answer'

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
    type?: FieldType
    titleCase?: boolean
    options?: string[]
    precompileValue?: boolean
}

type DisplayValue = {
    value: string,
    csv_value: string,
    extra_css: string,
    title: string,
    changed: boolean,
}

export class Field {
    name: string // used as key in data structures
    header: string // used as human-readable header in UI
    css_class: string // used in CSS
    css_style: undefined | CSSProperties | ((value: string) => CSSProperties)
    editable: boolean
    alternativeNames: string[] // alternative names for CSV column matching
    required: boolean = true
    hidden: boolean = false
    type: FieldType = 'text'
    titleCase: boolean = false
    options: string[]|undefined = undefined
    precompileValue: boolean = false

    constructor(name: string, {header, editable, type, alternativeNames, additionalCssStyle, css_style, hidden, required, titleCase, options, precompileValue}: FieldOptions = {}) {
        this.name = name
        this.header = header || name
        this.css_class = `field-${this.name}`
        if (additionalCssStyle) {
            this.css_class += ` ${additionalCssStyle}`
        }
        this.css_style = css_style || undefined
        this.editable = editable !== undefined ? editable : true
        this.alternativeNames = alternativeNames || []
        this.type = type || 'text'
        this.hidden = hidden !== undefined ? hidden : this.hidden
        this.required = required !== undefined ? required : true
        this.titleCase = titleCase || false
        this.options = options || undefined
        this.precompileValue = precompileValue || false
    }

    // Get all possible names for this field (main name + alternatives)
    getAllNames(): string[] {
        return [this.name, this.header, ...this.alternativeNames]
    }

    clean(value: string): string {
        value = value.trim()
        if (this.titleCase) {
            if (value.toLocaleUpperCase() === value) {
                // era tutto maiuscolo!
                value = value.toLocaleLowerCase()
            }
            if (value.toLocaleLowerCase() === value) {
                // l'utente non ha usato maiuscole/minuscole
                value = value.replace(/\b\w/g, c => c.toLocaleUpperCase())
            }
        }
        return value
    }

    isValid(value: string, data?: Data): boolean {
        if (this.required && !value) return false
        if (this.options && !this.options.includes(value) && value !=='') return false
        return true
    }

    display(value: string, old_value: string, showStandardAnswers: boolean): DisplayValue {
        return {
            value: value,
            csv_value: value,
            extra_css: '',
            title: value,
            changed: value !== old_value
        }
    }

    compare(value1: string, value2: string): number {
        if (this.type === 'number') {
            const n1 = parseFloat(value1) || 0
            const n2 = parseFloat(value2) || 0
            const r = ((n1 > n2) ? 1 : (n1 < n2) ? -1 : 0)
            console.log(`Comparing numeric values: ${value1} vs ${value2} => ${r}`)
            return r
        } else {
            const v1 = value1.toLowerCase()
            const v2 = value2.toLowerCase()
            return ((v1 > v2) ? 1 : (v1 < v2) ? -1 : 0)
        }
    }

    // valore anomalo anche se valido
    anomalous(value: string): boolean {
        return false
    }
}

export class VariantField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
    }

    display(value: string, old_value: string, showStandardAnswers: boolean): DisplayValue {
        if (showStandardAnswers) {
            let standard_code = ''
            // mostra il codice della variante standard
            
            // attenzione che il codice '0' o '000' indica studente 
            // assente e non va modificato

            if (value.length === 3) {
                // archimede
                // 323 => 311
                const c = value.charAt(0)
                if (c !== '0') standard_code = `${c}11` 
            }
            if (value.length === 1) {
                // gara delle prime
                // 3 => 1
                const c = value.charAt(0)
                if (c !== '0') standard_code = `1` 
            }
            if (standard_code !== '') {
                // solo se il codice non indica assenza
                return super.display(standard_code, standard_code, showStandardAnswers)
            }
        }
        return super.display(value, old_value, showStandardAnswers)
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
        this.type = 'choice-answer'
    }

    isValid(value: string, data: Data): boolean {
        console.log(`Validating ChoiceAnswerField ${this.name} with value "${value}" and data:`, data)
        if (data && (data['variant'] === '000' || data['variant'] === '0')) {
            return value==='' // se variante 0, lo studente è assente, deve essere vuoto
        } else {
            return super.isValid(value)
        }
    }

    display(value: string, old_value: string, showStandardAnswers: boolean): DisplayValue {
        if (value?.length === 7) {
            const changed = value.charAt(0) !== old_value.charAt(0);
            // showStandardAnswers decides whether to show 
            // the corresponding answers in the standard permutation (211/311)
            const correct_value = showStandardAnswers ? value.charAt(5) : value.charAt(3)
            value = showStandardAnswers ? value.charAt(4) : value.charAt(0);
            const extra_css = value === correct_value
                ? "correct"
                : value === '-' 
                ? "empty" 
                    : ["A", "B", "C", "D", "E"].includes(value) 
                    ? "incorrect" 
                    : "invalid";
            const title = (value === correct_value) ? value : `${value} (invece di ${correct_value})`;
            return {
                value: value,
                csv_value: value,
                extra_css: extra_css,
                title: title,
                changed: changed,
            }
        } else {
            if (showStandardAnswers) {
                super.display('?', '', showStandardAnswers);
            }
            return super.display(value, old_value, showStandardAnswers);
        }
    }
}

export class NumericAnswerField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-NumericAnswer`
        this.type = 'number'
    }
}

export class ScoreAnswerField extends Field {
    constructor(name: string, options: FieldOptions) {
        super(name, options)
        this.css_class += ` field-ScoreAnswer`
        this.type = 'number'
    }
}

export class DateField extends Field {
    expectedMinAge: number = NaN
    expectedMaxAge: number = NaN

    constructor(name: string, options: FieldOptions & {expectedMinAge?: number, expectedMaxAge?: number}) {
        super(name, options)
        this.css_class += ` field-Date`
        this.type = 'date'
        this.expectedMinAge = options.expectedMinAge || Number.NEGATIVE_INFINITY
        this.expectedMaxAge = options.expectedMaxAge || Number.POSITIVE_INFINITY
    }

    // normalizza la data in formato gg/mm/aaaa
    clean(value: string): string {
        value = value.trim()

        // se è nel formato yyyy-mm-dd la converte in dd/mm/yyyy
        const iso_date_match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (iso_date_match) {
            const year = iso_date_match[1]
            const month = iso_date_match[2]
            const day = iso_date_match[3]
            return `${day}/${month}/${year}`
        }

        // rimpiazza tutti i caratteri non numerici con /
        value = value.split('').map(c => (c >= '0' && c <= '9' ? c : '/')).join('')

        // rimpiazza doppie barre con una sola barra
        value = value.replace(/\/+/g, '/')

        // aggiunge padding di 0 se ci sono meno di due cifre
        const parts = value.split('/').map((part, index) =>
        (part.length === 1 && (index < 2)) 
            ? '0' + part 
            : part)

        // aggiunge secolo 20 se ho tre elementi e il terzo ha due cifre
        if (parts.length === 3 && 2===parts[2].length) {
        parts[2] = '20' + parts[2]
        }

        // aggiunge 200 se l'anno ha una sola cifra
        if (parts.length === 3 && 1 === parts[2].length) {
        parts[2] = '200' + parts[2]
        }

        value = parts.join('/')

        if (value === '/' || value === '//') value=''
        return value
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

    anomalous(value: string): boolean {
        if (this.isValid(value)) {
            // TODO:
            // questo controllo non va bene,
            // bisogna conoscere l'anno in cui si è svolta 
            // la gara, non l'anno corrente
            const thisYear = new Date().getFullYear()
            const year = parseInt(value.substring(6,10), 10)
            const age = thisYear - year
            return age < this.expectedMinAge || age > this.expectedMaxAge
        }
        return false
    }

    // Approssimazione della funzione errore (erf) per x >= 0
    private erf(x: number): number {
        const a1 = 0.254829592
        const a2 = -0.284496736
        const a3 = 1.421413741
        const a4 = -1.453152027
        const a5 = 1.061405429
        const p = 0.3275911
        const t = 1 / (1 + p * x)
        return 1 - (a1 * t + a2 * t * t + a3 * t * t * t + a4 * t * t * t * t + a5 * t * t * t * t * t) * Math.exp(-x * x)
    }
}

export class ScoreField extends Field {
    max_score: number
    
    constructor(name: string, max_score: number, options: FieldOptions = {}) {
        super(name, {header: 'Punti', type: 'number', editable: false, required: false, css_style: (scoreStr: string) => score_to_color_style(scoreStr, max_score), ...options})
        this.max_score = max_score
        this.css_class += ` field-Score`
        this.type = 'number'
    }
}

export function score_to_color_style(scoreStr: string, max_score: number = 80): React.CSSProperties {
    // Clamp del valore tra 0 e 80
    let score = parseFloat(scoreStr)
    if (isNaN(score) || score < 0) return {}
    score = score / max_score

    let r, g, b;

    if (score <= 0.5) {
        // Fase 1: Da Rosso (#DE9D9B) a Giallo (#FBE6A3)
        // Score 0 -> 40
        const t = 2*score;
        r = Math.round(0xDE + (0xFB - 0xDE) * t);
        g = Math.round(0x9D + (0xE6 - 0x9D) * t);
        b = Math.round(0x9B + (0xA3 - 0x9B) * t);
    } else {
        // Fase 2: Da Giallo (#FBE6A3) a Verde (#BBD6AB)
        // Score 40 -> 80
        const t = (score - 0.5) * 2;
        r = Math.round(0xFB + (0xBB - 0xFB) * t);
        g = Math.round(0xE6 + (0xD6 - 0xE6) * t);
        b = Math.round(0xA3 + (0xAB - 0xA3) * t);
    }

    return { backgroundColor: `rgb(${r},${g},${b})` };
}