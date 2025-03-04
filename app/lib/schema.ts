import { Data } from "@/app/lib/models";

const Id = "Id"
const Zona = "Zona"
const Codice = "Codice"
const Cognome = "Cognome"
const Nome = "Nome"
const Classe = "Classe"
const Sezione = "Sezione"
const Scuola = "Scuola"
const DataNascita = "DataNascita"
const ChoiceAnswer = "ChoiceAnswer"
const NumberAnswer = "NumberAnswer"
const ScoreAnswer = "ScoreAnswer"
const Computed = "Computed"
const Frozen = "Frozen"

type Fields = Data

export class Schema {
    fields: Fields
    
    constructor(fields: Fields) {
        this.fields = fields;
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
    }
}

export class AmmissioneSenior extends Schema {
    params: string

    constructor(params: string='{}') {
        super({
            id: Id,
            zona: Zona,
            cognome: Frozen,
            nome: Frozen,
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
    }
}

export const schemas = {
    "archimede": new Archimede(),
    "distrettuale": new Distrettuale(),
    "ammissioneSenior": new AmmissioneSenior(),
}

export type AvailableSchemas = keyof typeof schemas
