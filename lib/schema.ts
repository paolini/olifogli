import { calcolaPunteggio } from "./answers"

export const availableFields = ["cognome", "nome", "classe", "sezione", "scuola", "data_nascita"] as const
export type AvailableFields = (typeof availableFields)[number]

export const availableAnswers = ["choice", "number", "score"]
export type AvailableAnswers = (typeof availableAnswers)[number]

export type Info = {
    [key in AvailableFields]?: string;
}

export type DataRow = Info & {
    updatedOn?: string;
    risposte: string[];
}

export class Schema {
    fields: AvailableFields[] = [];
    answers: AvailableAnswers[] = [];
    
    constructor(fields: AvailableFields[], answers: AvailableAnswers[]) {
        this.fields = fields;
        this.answers = answers;
    }

    clean(data: DataRow): DataRow {
        const cleaned: DataRow = {risposte: []}
        for (const field of this.fields) {
            cleaned[field] = data[field] || ""
        }
        this.answers.forEach((answer, i) => {
            cleaned.risposte[i] = data.risposte[i] || ""
        })
        return cleaned
    }

    computeScore(row: DataRow): string {
        void row // unused
        return "???"
    }

    isValid(row: DataRow): boolean {
        void row // unused
        return false        
    }
}

export class Distrettuale extends Schema {
    params: any
    
    constructor(params: any = {}) {
        super(
            [   "cognome", "nome", "data_nascita", 
                "classe", "sezione", "scuola"],
            [   "choice", "choice", "choice", "choice", 
                "choice", "choice", "choice", "choice", 
                "choice", "choice", "choice", "choice", 
                "number", "number", "score", "score", "score"])
        this.params = params
    }

    computeScore(row: DataRow): string {
        return `${calcolaPunteggio(row.risposte)}`
    }

    // da integrare con un set di condizioni completo
    isValid(row: DataRow): boolean {
        if (row.risposte.includes("")) return false
        if (row.cognome == "") return false
        if (row.nome == "") return false
        return true
    } 
}

const schemas = {
    "distrettuale": new Distrettuale()
}