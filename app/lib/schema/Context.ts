import { PermutationsObject } from './PERMUTATIONS'
import { Data } from "../models"

export type RowValidationContext = {
    absent: boolean,
    context: ValidationContext,
}

export type ValidationContext = {
    absent: (data: Data) => boolean,
    school_external_id: (data: Data) =>string,
    contest_year: number,
    contest_id: number,
    permutation_object?: PermutationsObject,
    answers_object?: {
        correct: Record<string, string>,
        points: {
            correct: number,
            wrong: number,
            empty: number,
            invalid: number,
        }
    }
}

