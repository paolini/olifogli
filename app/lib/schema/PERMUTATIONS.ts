/**
 * codici compito archimede 2025
 *
 * i codici di permutazione sono 2xy per il biennio e 3xy per il triennio
 * y (da 1 a 8) è il codice permutazione domanda
 * x (da 1 a 5) è il codice permutazione risposta
 *
 * se il codice di permutazione è, ad esempio, y=2, la sequenza 2143 6785 ... ... 
 * va così interpretata: i quesiti sono elencati in modo che per primo appaia 
 * quello che nel compito base del biennio (codice 211) è il quesito 2, 
 * per secondo il quesito 1, per terzo il 4, per quarto il 3, per quinto il 6, 
 * per sesto il 7, per settimo l'8 e per ottavo il 5
 *
 * se la permutazione è, ad esempio, CEABD va così interpretata: per ciascun quesito, 
 * le risposte sono elencate in modo che per prima appaia quella 
 * che nel compito base del biennio (codice 211) è la risposta C, 
 * per seconda la risposta E, per terza la risposta A, 
 * per quarta la B e per quinta la D
 **/

const permutations: {
    correct: {[key:string]: string},
    questions: {[key:string]: number[]},
    answers: {[key:string]: string},
} = {
    correct: {
        "2": "DCEABDACACDECBAE",
        "3": "BAEDCBDAEDCBACEB",
        "4": "ADCBEDCABDCEDEAB",
        "5": "ACDEDBCAEBADBACE",
    },
    questions: {
        "1": [1, 2, 3, 4,  5, 6, 7, 8,  9, 10, 11, 12,  13, 14, 15, 16],
        "2": [2, 1, 4, 3,  6, 7, 8, 5,  11, 12, 9, 10,  16, 15, 14, 13], 
        "3": [3, 4, 1, 2,  8, 7, 6, 5,  10, 11, 12, 9,  13, 16, 14, 15],
        "4": [4, 2, 3, 1,  7, 8, 5, 6,  12, 9, 10, 11,  15, 13, 16, 14],
        "5": [4, 1, 2, 3,  8, 5, 7, 6,  11, 10, 12, 9,  13, 15, 14, 16],
        "6": [3, 2, 4, 1,  6, 8, 5, 7,  12, 10, 11, 9,  13, 14, 16, 15],
        "7": [1, 3, 4, 2,  7, 6, 8, 5,  10, 12, 9, 11,  16, 13, 15, 14],
        "8": [2, 3, 1, 4,  5, 7, 6, 8,  9, 11, 10, 12,  14, 16, 13, 15]
    },
    answers: {
        "1": "ABCDEX-",
        "2": "BADECX-",
        "3": "CEABDX-",
        "4": "DCEABX-",
        "5": "EDBCAX-"
    }
};

type MappingResult = {
    answers_mapping: {[key:string]:string},
    answers_inverse_mapping: {[key:string]:string},
    questions_permutation: number[],
    questions_inverse_permutation: number[],
    correct_answers: string[],
}

const variant_to_permutations: {[key:string]: MappingResult} = {}

function computeVariantMappings(variantCode:string): MappingResult|string {
    const cached = variant_to_permutations[variantCode];
    if (cached) return cached;

    if (variantCode.length !== 3) {
        return "codice compito non valido (3 cifre)";
    }

    const year = variantCode.charAt(0);
    const answerCode = variantCode.charAt(1);
    const questionCode = variantCode.charAt(2);

    const questions_permutation = permutations.questions[questionCode].map(i => i-1);
    const permutation_answers = permutations.answers[answerCode];
    const correct_answers = permutations.correct[year].split('');

    if (!questions_permutation) {
        return "codice compito non valido";
    }
    if (!permutation_answers) {
        return "codice compito non valido";
    }
    if (!correct_answers) {
        return "codice compito non valido";
    }

    const answers_mapping = Object.fromEntries("ABCDEX-".split('').map((a,i) => ([a, permutation_answers.charAt(i)])));
    const questions_inverse_permutation = Array(16).map(_ => -1);
    questions_permutation.forEach((q,i) => {
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

export default function decodePermutations(variantCode: string, answers: string[]) {
    const mappingResult = computeVariantMappings(variantCode);
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

    const remapped_answers = questions_inverse_permutation.map(j => answers_mapping[answers[j].charAt(0)]);
    const correct_answer_count = correct_answers.reduce((count: number, correctAnswer: string, i: number) => count + (remapped_answers[i] === correctAnswer ? 1 : 0), 0);
    const empty_answer_count = remapped_answers.reduce((count: number, answer: string) => count + (answer === '-' || answer === 'X' ? 1 : 0), 0);
    const score = correct_answer_count*5 + empty_answer_count;
    const extended_answers = questions_permutation.map(
        (j,i) => 
            `${answers[i].charAt(0) || ' '} [${answers_inverse_mapping[correct_answers[j]]}${remapped_answers[i]}${correct_answers[i]}]`);
    return {
        error: '',
        score,
        extended_answers
    }
}

