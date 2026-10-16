import Papa from 'papaparse'

/** Serialize CSV while forcing formula-like text (including headers) to text. */
export function unparseCsv<T>(data: T[] | Papa.UnparseObject<T>): string {
    return Papa.unparse(data, {
        // Match the prefix only: a formula may also contain embedded newlines.
        escapeFormulae: /^[=+\-@\t\r\n]/,
    })
}
