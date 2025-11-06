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
 * esempio: !!! QUESTI NON SONO I DATI REALI, SONO SOLO DI ESEMPIO
 * 
 * permutations_correct_2:	BDBBABCBDBEDDBAC
 * permutations_correct_3:	CDBBDBABDEBDEDBA
 * permutations_questions_1:	[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
 * permutations_questions_2:	[3, 4, 1, 2, 8, 7, 6, 5, 10, 11, 12, 9, 13, 16, 14, 15]
 * permutations_questions_3:	[2, 1, 4, 3, 6, 7, 8, 5, 11, 12, 9, 10, 16, 15, 14, 13]
 * permutations_questions_4:	[3, 2, 4, 1, 6, 8, 5, 7, 12, 10, 11, 9, 13, 14, 16, 15]
 * permutations_questions_5:	[4, 1, 2, 3, 8, 5, 7, 6, 11, 10, 12, 9, 13, 15, 14, 16]
 * permutations_questions_6:	[1, 3, 4, 2, 7, 6, 8, 5, 10, 12, 9, 11, 16, 13, 15, 14]
 * permutations_questions_7:	[4, 2, 3, 1, 7, 8, 5, 6, 12, 9, 10, 11, 15, 13, 16, 14]
 * permutations_questions_8:	[2, 3, 1, 4, 5, 7, 6, 8, 9, 11, 10, 12, 14, 16, 13, 15]
 * permutations_answers_1:	ABCDE
 * permutations_answers_2:	EDBCA
 * permutations_answers_3:	DCEAB
 * permutations_answers_4:	CEABD
 * permutations_answers_5:	BADEC
 ******/

export function buildPermutationsObject(sheetCommonData?: Data, workbookCommonData?: Data) {
    const commonData = {...(workbookCommonData || {}), ...(sheetCommonData || {})};

    // ATTENZIONE: internamente gli array sono 0-based
    // tranne correct che infatti usa le stringhe '2','3','4','5'.

    const permutations: PermutationsObject = {
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
            if (parts.length !== 3) {
                throw new Error(`Invalid permutation key format: ${key}`);
            }

            const [, type, index] = parts;

            if (type === 'correct') {
                permutations.correct[index] = value;
            } else if (type === 'questions') {
                const value_array = JSON.parse(value);
                if (!Array.isArray(value_array)) {
                    throw new Error(`Permutation questions value for key "${key}" is not a valid array.`);
                }
                permutations.questions[index] = value_array;
            } else if (type === 'answers') {
                permutations.answers[index] = value;
            } else if (type === 'points') {
                const value_number = Number(value);
                if (isNaN(value_number)) {
                    throw new Error(`Permutation points value for key "${key}" is not a valid number.`);
                }
                if (!(index in permutations.points)) {
                    throw new Error(`Unknown points index "${index}" in key "${key}"`);
                }
                permutations.points[index as keyof typeof permutations.points] = value_number;

            } else {
                throw new Error(`Unknown permutation type "${type}" in key "${key}"`);
            }
        }
    }

    return permutations;
}

type MappingResult = {
    answers_mapping: {[key:string]:string},
    answers_inverse_mapping: {[key:string]:string},
    questions_permutation: number[],
    questions_inverse_permutation: number[],
    correct_answers: string[],
}

const variant_to_permutations: {[key:string]: MappingResult} = {}

function computeVariantMappings(variantCode:string, permutations_data: PermutationsObject): MappingResult|string {
    const cached = variant_to_permutations[variantCode];
    if (cached) return cached;

    if (variantCode.length !== 3) {
        return "codice compito non valido (3 cifre)";
    }

    const year = variantCode.charAt(0);
    const answerCode = variantCode.charAt(1);
    const questionCode = variantCode.charAt(2);

    const questions_permutation = permutations_data.questions[questionCode]?.map((i:number) => i-1);
    const permutation_answers = permutations_data.answers[answerCode]+'X-';
    const correct_raw = permutations_data.correct[year];
    if (!questions_permutation) {
        return "codice compito non valido";
    }
    if (!permutation_answers) {
        return "codice compito non valido";
    }
    if (!correct_raw) {
        return "codice compito non valido";
    }
    const correct_answers = correct_raw.split('');

    const answers_mapping = Object.fromEntries("ABCDEX-".split('').map((a,i) => ([a, permutation_answers.charAt(i)])));
    const questions_inverse_permutation: number[] = Array(16).fill(-1);
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

export function decodePermutations(variantCode: string, answers: string[], permutations_data: PermutationsObject) {
    const mappingResult = computeVariantMappings(variantCode, permutations_data);
    if (typeof mappingResult === 'string') {
        return {
            error: mappingResult,
            score: '',
            extended_answers: answers,
        };
    }
    const {
        answers_mapping,
        answers_inverse_mapping,
        questions_permutation,
        questions_inverse_permutation,
        correct_answers,
    } = mappingResult;

    const n_questions = correct_answers.length;
    const remapped_answers = questions_inverse_permutation.map(j => answers_mapping[answers[j].charAt(0)]);

    const extended_answers = questions_permutation.map(
        (j,i) => 
            `${answers[i].charAt(0) || '?'} [${answers_inverse_mapping[correct_answers[j]] || '?'}${remapped_answers[i] || '?'}${correct_answers[i] || '?'}]`);

    let correct_answer_count = 0;
    let wrong_answer_count = 0;
    let empty_answer_count = 0;
    let invalid_answer_count = 0;
    for (let i = 0; i < n_questions; i++) {
        const student_answer = remapped_answers[i];
        if (student_answer === '-') {
            empty_answer_count++;
        } else if (student_answer === correct_answers[i]) {
            correct_answer_count++;
        } else if (['A','B','C','D','E'].includes(student_answer)) {
            wrong_answer_count++;
        } else {
            invalid_answer_count++;
        }
    }

    const score = correct_answer_count*permutations_data.points.correct 
        + empty_answer_count*permutations_data.points.empty 
        + invalid_answer_count*permutations_data.points.invalid 
        + wrong_answer_count*permutations_data.points.wrong;

    // consistency check
    const scores = computeScores(extended_answers, permutations_data);
    if (score !== scores.reduce((a,b) => a+b, 0)) {
        console.log(JSON.stringify({permutations_data, variantCode, answers, extended_answers, score, scores}));
        throw new Error(`Incoerenza nel punteggio per la variante ${variantCode} risposte ${answers}`);
    }

    return {
        error: '',
        score,
        extended_answers
    }
}

export function computeScores(extended_answers: string[], permutations_data: PermutationsObject) {
    return extended_answers.map(s => {
        if (!s.match(/^[A-EX\-] \[[A-EX\-][A-EX\-][A-EX\-]\]$/)) {
            throw new Error(`Formato di risposta estesa non valido: "${s}"`);
        }
        const answer = s.charAt(4);
        const correct_answer = s.charAt(5);
        if (answer === '-') return permutations_data.points.empty;
        if (answer === 'X') return permutations_data.points.invalid;
        if (answer === correct_answer) return permutations_data.points.correct;
        else return permutations_data.points.wrong;
    })
}
