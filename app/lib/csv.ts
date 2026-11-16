import Papa from 'papaparse'

/**
 * Text cells starting with one of these characters are prefixed with an
 * apostrophe on export, so that spreadsheets show them as text instead of
 * evaluating them as formulas. Match the prefix only: a formula may also
 * contain embedded newlines. A lone `-` (the empty answer) is not a formula
 * and is exported unchanged.
 */
const FORMULA_PREFIX = /^(?:[=+@\t\r\n]|-(?!$))/

/** Serialize CSV while forcing formula-like text (including headers) to text. */
export function unparseCsv<T>(data: T[] | Papa.UnparseObject<T>): string {
    return Papa.unparse(data, {
        escapeFormulae: FORMULA_PREFIX,
    })
}

/**
 * Undo the apostrophe that `unparseCsv` adds to formula-like text. Also
 * accepts `'-`, which earlier versions produced for the empty answer.
 */
const ESCAPED_PREFIX = /^'[=+\-@\t\r\n]/

export function unescapeCsvValue(value: string): string {
    if (ESCAPED_PREFIX.test(value)) {
        return value.substring(1)
    }
    return value
}
