import { Data } from '../models'

export type Points = {
    correct: number,
    wrong: number,
    empty: number,
    invalid: number,
};

export type PermutationsObject = {
    correct: {[key: string]: string},
    questions: {[key: string]: number[]},
    answers: {[key: string]: string},
    points: Points  
};
/*******
 * Formato delle impostazioni del workbook (valori stringa):
 *
 * permutations_questions_<c>:  "[3, 1, 4, 2, ...]"  permutazione delle domande 1..n
 * permutations_answers_<c>:    "EADCB"              permutazione di ABCDE
 * permutations_correct_<anno>: "DEAC..."            n risposte tra A-E, X e -
 * permutations_points_correct, _wrong, _empty, _invalid: numeri
 *
 * Un esempio completo, con dati sintetici e non reali, è in
 * scripts/fixtures/archimede.json.
 ******/

/**
 * Builds the answer keys, permutations and points from the `permutations_*`
 * settings of the workbook. Shared by every schema scored with permutations
 * (Archimede, Gara delle prime).
 */
export function buildPermutationObject(commonData: Data): PermutationsObject {
    // ATTENZIONE: internamente gli array sono 0-based
    // tranne correct che infatti usa le stringhe '2','3','4','5'.

    const permutation_object: PermutationsObject = {
        correct: {},
        questions: {},
        answers: {},
        points: {
            correct: -Infinity,
            wrong: -Infinity,
            empty: -Infinity,
            invalid: -Infinity,
        }
    };

    let empty = true;

    for (const key in commonData) {
        if (key.startsWith('permutations_')) {
            empty = false;
            const value = commonData[key];
            const parts = key.split('_');
            if (parts.length > 3) {
                throw new Error(`Invalid permutation key format: ${key}`);
            }

            const [, type, index] = parts;

            if (type === 'correct') {
                permutation_object.correct[index || ''] = value;
            } else if (type === 'questions') {
                const value_array = JSON.parse(value);
                if (!Array.isArray(value_array)) {
                    throw new Error(`Permutation questions value for key "${key}" is not a valid array.`);
                }
                permutation_object.questions[index] = value_array;
            } else if (type === 'answers') {
                permutation_object.answers[index] = value;
            } else if (type === 'points') {
                const value_number = Number(value);
                if (isNaN(value_number)) {
                    throw new Error(`Permutation points value for key "${key}" is not a valid number.`);
                }
                if (!(index in permutation_object.points)) {
                    throw new Error(`Unknown points index "${index}" in key "${key}"`);
                }
                permutation_object.points[index as keyof typeof permutation_object.points] = value_number;

            } else {
                throw new Error(`Unknown permutation type "${type}" in key "${key}"`);
            }
        }
    }

    if (empty) {
        throw new Error(`Permutation object is empty, no keys starting with "permutations_" found in common data. Configurazione della raccolta errata?`);
    }

    checkPermutationObject(permutation_object);
    return permutation_object;
}

/**
 * Rejects incomplete or inconsistent settings, which would otherwise score
 * silently wrong (a missing points value counted as -Infinity) or fail only
 * while scoring a row.
 */
export function checkPermutationObject(permutations: PermutationsObject) {
    for (const [name, value] of Object.entries(permutations.points)) {
        if (!Number.isFinite(value)) throw new Error(`manca l'impostazione "permutations_points_${name}"`);
    }
    const lengths = new Set<number>();
    for (const [code, questions] of Object.entries(permutations.questions)) {
        const sorted = [...questions].sort((a, b) => a - b);
        if (!sorted.every((q, i) => q === i + 1)) {
            throw new Error(`"permutations_questions_${code}" non è una permutazione dei numeri da 1 a ${questions.length}`);
        }
        lengths.add(questions.length);
    }
    if (lengths.size > 1) throw new Error(`le impostazioni "permutations_questions_*" hanno lunghezze diverse`);
    const n = [...lengths][0];
    for (const [code, answers] of Object.entries(permutations.answers)) {
        if ([...answers].sort().join('') !== 'ABCDE') {
            throw new Error(`"permutations_answers_${code}" non è una permutazione di ABCDE`);
        }
    }
    for (const [year, correct] of Object.entries(permutations.correct)) {
        const key = year ? `permutations_correct_${year}` : 'permutations_correct';
        if (!/^[A-EX-]*$/.test(correct)) throw new Error(`"${key}" contiene caratteri diversi da A-E, X e -`);
        if (n !== undefined && correct.length !== n) throw new Error(`"${key}" ha ${correct.length} risposte invece di ${n}`);
    }
}

type MappingResult = {
    answers_mapping: {[key:string]:string},
    answers_inverse_mapping: {[key:string]:string},
    questions_permutation: number[],
    questions_inverse_permutation: number[],
    correct_answers: string[],
}

const variant_to_permutations: {[key:string]: MappingResult} = {}
let last_permutations_fingerprint = "";

function computeVariantMappings(variantCode:string, permutations_data: PermutationsObject): MappingResult|string {
    const current_fingerprint = JSON.stringify(permutations_data);
    if (current_fingerprint !== last_permutations_fingerprint) {
        last_permutations_fingerprint = current_fingerprint;
        for (const key in variant_to_permutations) delete variant_to_permutations[key];
    }

    const cached = variant_to_permutations[variantCode];
    if (cached) return cached;

    let year, answerCode, questionCode;

    if (variantCode.length === 3) {
        year = variantCode.charAt(0);
        answerCode = variantCode.charAt(1);
        questionCode = variantCode.charAt(2);
    } else if (variantCode.length === 1) {
        year = '';
        answerCode = variantCode
        questionCode = variantCode
    } else {
        return "codice compito non valido (lunghezza errata)";
    }

    const questions_permutation = permutations_data.questions[questionCode]?.map((i:number) => i-1);
    if (!questions_permutation) {
        if (Object.keys(permutations_data.questions).length === 0) {
            return "configurazione errata (mancano 'permutations_questions_X')";
        } else return "codice compito non valido";
    }

    if (!permutations_data.answers[answerCode]) {
        if (Object.keys(permutations_data.answers).length === 0) {
            return "configurazione errata (manca 'answers_permutation')";
        }
        return "codice compito non valido";
    }
    const permutation_answers = permutations_data.answers[answerCode]+'X-';

    const correct_raw = permutations_data.correct[year];
    if (!correct_raw) {
        if (Object.keys(permutations_data.correct).length === 0) {
            return "configurazione errata (manca 'correct_answers')";
        }
        return "codice compito non valido";
    }
    const correct_answers = correct_raw.split('');

    const answers_mapping = Object.fromEntries("ABCDEX-".split('').map((a,i) => ([a, permutation_answers.charAt(i)])));
    const questions_inverse_permutation: number[] = Array(questions_permutation.length).fill(-1);
    questions_permutation.forEach((q: number,i: number) => {
        questions_inverse_permutation[q] = i;
    })
    const answers_inverse_mapping: {[key:string]:string} = Object.fromEntries(
        Object.entries(answers_mapping).map(
            ([key, value]) => ([value, key])));
    const result: MappingResult = {
        answers_mapping,
        answers_inverse_mapping,
        questions_inverse_permutation,
        questions_permutation,
        correct_answers,
    };
    variant_to_permutations[variantCode] = result;
    return result;
}

/**
 * `allowedYears`: first digits accepted for three-digit codes (for example
 * ['2'] on Archimede biennio), so that a code of another year is not scored
 * with that year's answer key.
 */
export function decodePermutations(variantCode: string, answers: string[], permutations_data: PermutationsObject, allowedYears?: string[]) {
    if (!variantCode) {
        throw new Error("not yet implemented");        
    }
    if (allowedYears && variantCode.length === 3 && !allowedYears.includes(variantCode.charAt(0))) {
        return {
            error: `codice compito non valido: deve iniziare con ${allowedYears.join(' o ')}`,
            score: 0,
            extended_answers: answers,
        };
    }
    const mappingResult = computeVariantMappings(variantCode, permutations_data);
    if (typeof mappingResult === 'string') {
        return {
            error: mappingResult,
            score: 0,
            extended_answers: answers,
        };
    }
    const {
        answers_mapping,
        answers_inverse_mapping,
        questions_permutation,
        questions_inverse_permutation,
        correct_answers,
    } = mappingResult

    const remapped_answers = variantCode 
       ? questions_inverse_permutation.map(j => answers_mapping[answers[j].charAt(0)])
       : answers;

    const extended_answers = variantCode 
        ? questions_permutation.map(
            (j,i) => 
                `${answers[i].charAt(0) || '?'} [${answers_inverse_mapping[correct_answers[j]] || '?'}${remapped_answers[i] || '?'}${correct_answers[i] || '?'}]`)
        : answers;

    // console.log(JSON.stringify({n_questions, remapped_answers, correct_answers, extended_answers}));

    const scores = computeScoresWithVariants(extended_answers, permutations_data);
    const score = scores.reduce((a,b) => a+b, 0);

    return {
        error: '',
        score,
        extended_answers
    }
}

export function computeScoresWithVariants(extended_answers: string[], permutations_data: PermutationsObject) {
    return extended_answers.map((s, i) => {
        if (!s.match(/^[A-EX?\-] \[[A-EX\-][A-EX?\-][A-EX\-]\]$/)) throw new Error(`Formato di risposta estesa non valido: "${s}"`);
        const answer = s.charAt(4);
        const correct_answer = s.charAt(5);
        if (answer === '-') return permutations_data.points.empty;
        if (answer === 'X') return permutations_data.points.invalid;
        if (answer === correct_answer) return permutations_data.points.correct;
        else return permutations_data.points.wrong;
        }
    )
}
