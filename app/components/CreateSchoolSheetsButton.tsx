import { schemas } from "../lib/schema"

export default function CreateSchoolSheetsButton({ sheet }: {
    sheet: { _id: string, schema: string }
}) {
    const Schema = schemas[sheet.schema]
    if (!Schema) return <Error error={new Error(`Schema "${sheet.schema}" not found`)} />
    return <button onClick={handleCreate} className="btn btn-primary">
            Crea fogli per la scuola
        </button>
}   