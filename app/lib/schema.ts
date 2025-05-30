import { Data } from "@/app/lib/models";

const Id = "Id"
const Zona = "Zona"
const ZonaId = "ZonaId"
const Codice = "Codice"
const Cognome = "Cognome"
const Nome = "Nome"
const Classe = "Classe"
const Sezione = "Sezione"
const Scuola = "Scuola"
const ScuolaId = "ScuolaId"
const DataNascita = "DataNascita"
const ChoiceAnswer = "ChoiceAnswer"
const NumberAnswer = "NumberAnswer"
const ScoreAnswer = "ScoreAnswer"
const Computed = "Computed"
const Frozen = "Frozen"

type Fields = Data

export class Schema {
    fields: Fields
    name: string
    
    constructor(fields: Fields) {
        this.fields = fields
        this.name = "foglio"
    }

    clean(data: Data): Data {
        const cleaned: Data = Object.fromEntries(Object.entries(this.fields).map(([field, type]) => [field, data[field] || ""]))
        return cleaned
    }

    // da integrare con un set di condizioni completo
    isValid(row: Data): boolean {
        Object.entries(this.fields).map(([field, type]) => {
            if (type !== Computed && row[field] == "") return false
        })
        return true
    } 

    csv_header(): string[] {
        return Object.keys(this.fields)
    }

    csv_row(row: Data): string[] {
        return Object.entries(this.fields).map(([field, type]) => {
            if (type === Computed) return "???" // da calcolare in base al codice e alle permutazioni
            return row[field] || ""
        })
    }
}

export class Archimede extends Schema {
    params: string

    constructor(params: string='{}') {
        super({
            codice: Codice,
            cognome: Cognome,
            nome: Nome,
            dataNascita: DataNascita,
            classe: Classe,
            sezione: Sezione,
            scuola: Scuola,
            r01: ChoiceAnswer,
            r02: ChoiceAnswer,
            r03: ChoiceAnswer,
            r04: ChoiceAnswer,
            r05: ChoiceAnswer,
            r06: ChoiceAnswer,
            r07: ChoiceAnswer,
            r08: ChoiceAnswer,
            r09: ChoiceAnswer,
            r10: ChoiceAnswer,
            r11: ChoiceAnswer,
            r12: ChoiceAnswer,
            punti: Computed,
        })
        this.params = params
        this.name = "archimede"
    }

    clean(data: Data): Data {
        const cleaned: Data = Object.fromEntries(Object.entries(this.fields).map(([field, type]) => [field, data[field] || ""]))
        return {
            ...cleaned,
            punti: "???" // da calcolare in base al codice e alle permutazioni
        }
    }

    // da integrare con un set di condizioni completo
    isValid(row: Data): boolean {
        Object.entries(this.fields).map(([field, type]) => {
            if (type !== Computed && row[field] == "") return false
        })
        return true
    } 
}

export class Distrettuale extends Schema {
    params: string

    constructor(params: string='{}') {
        super({
            cognome: Frozen,
            nome: Frozen,
            classe: Frozen,
            sezione: Frozen,
            scuola: Frozen,
            r01: ChoiceAnswer,
            r02: ChoiceAnswer,
            r03: ChoiceAnswer,
            r04: ChoiceAnswer,
            r05: ChoiceAnswer,
            r06: ChoiceAnswer,
            r07: ChoiceAnswer,
            r08: ChoiceAnswer,
            r09: ChoiceAnswer,
            r10: ChoiceAnswer,
            r11: ChoiceAnswer,
            r12: ChoiceAnswer,
            r13: NumberAnswer,
            r14: NumberAnswer,
            r15: ScoreAnswer,
            r16: ScoreAnswer,
            r17: ScoreAnswer,
            punti: Computed,
        })
        this.params = params
        this.name = "distrettuale"
    }
}

export class AmmissioneSenior extends Schema {
    params: string

    constructor(params: string='{}') {
        super({
            id: Id,
            cognome: Frozen,
            nome: Frozen,
            scuola_id: Frozen,
            scuola: Frozen,
            zona_id: Frozen,
            zona: Frozen,
            r01: ChoiceAnswer,
            r02: ChoiceAnswer,
            r03: ChoiceAnswer,
            r04: ChoiceAnswer,
            r05: ChoiceAnswer,
            r06: ChoiceAnswer,
            r07: ChoiceAnswer,
            r08: ChoiceAnswer,
            r09: ChoiceAnswer,
            r10: ChoiceAnswer,
            r11: ChoiceAnswer,
            r12: ChoiceAnswer,
            r13: ChoiceAnswer,
            r14: ChoiceAnswer,
            r15: ChoiceAnswer,
            r16: ChoiceAnswer,
            r17: ChoiceAnswer,
            r18: ChoiceAnswer,
            r19: ChoiceAnswer,
            r20: ChoiceAnswer,
            punti: Computed,
        })
        this.params = params
        this.name = "ammissione_senior"
    }

    csv_header(): string[] {
        return [
            ...super.csv_header(),
            "stringa risposte",
        ]
    }

    csv_row(row: Data): string[] {
        const baseRow = super.csv_row(row)
        const answers = Object.entries(this.fields)
            .filter(([field, type]) => type === ChoiceAnswer)
            .map(([field, _]) => row[field] || "X")
            .join("")
        return [...baseRow, answers]
    }
}

export const schemas = {
    "archimede": new Archimede(),
    "distrettuale": new Distrettuale(),
    "ammissioneSenior": new AmmissioneSenior(),
}

export type AvailableSchemas = keyof typeof schemas
