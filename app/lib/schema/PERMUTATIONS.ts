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

    const permutation_answers = permutations_data.answers[answerCode]+'X-';
    if (!permutation_answers) {
        if (Object.keys(permutations_data.answers).length === 0) {
            return "configurazione errata (manca 'answers_permutation')";
        }
        return "codice compito non valido";
    }

    const correct_raw = permutations_data.correct[year];
    if (!correct_raw) {
        if (Object.keys(permutations_data.correct).length === 0) {
            return "configurazione errata (manca 'correct_answers')";
        }
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
    if (!variantCode) {
        throw new Error("not yet implemented");        
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
