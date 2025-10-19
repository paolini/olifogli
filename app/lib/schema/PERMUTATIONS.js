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

const permutations = {
    model: {
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
        "1": "ABCDE",
        "2": "BADEC",
        "3": "CEABD",
        "4": "DCEAB",
        "5": "EDBCA"
    }
};

const variant_to_permutations = {}

function computeVariantMappings(variantCode) {
    const cached = variant_to_permutations[variantCode];
    if (cached) return cached;

    const year = variantCode.charAt(0);
    const answerCode = variantCode.charAt(1);
    const questionCode = variantCode.charAt(2);

    const permQuestions = permutations.questions[questionCode];
    const permAnswers = permutations.answers[answerCode];
    const modelSequence = permutations.model[year];

    // Aggiungi controlli per debug
    if (!permQuestions) {
        return {error: `Permutazione domande non trovata per questionCode: "${questionCode}" (variant: ${variantCode})`};
    }
    if (!permAnswers) {
        return {error: `Permutazione risposte non trovata per answerCode: "${answerCode}" (variant: ${variantCode})`};
    }
    if (!modelSequence) {
        return {error: `Modello non trovato per year: "${year}" (variant: ${variantCode})`};
    }

    let answers_mapping = Object.fromEntries("ABCDE".split('').map((a,i) => ([a, permAnswers.charAt(i)])));
    answers_mapping['-'] = '-';
    answers_mapping['X'] = 'X';
    
    let questions_inverse_permutation = Array(16).map(_ => -1);
    permQuestions.forEach((q,i) => {
        questions_inverse_permutation[q-1] = i;
    })
    const result = {
        error: '',
        answers_mapping,
        questions_inverse_permutation,
        modelSequence,
        permAnswers,
    };
    variant_to_permutations[variantCode] = result;
    return result;
}

export default function decodePermutations(variantCode,answers) {
    console.log('decodePermutations', {variantCode, answers});
    const { 
        error, 
        answers_mapping, 
        questions_inverse_permutation, 
        modelSequence, 
        permAnswers 
    } = computeVariantMappings(variantCode);

    if (error) return {error};

    const remapped_answers = questions_inverse_permutation.map(j => answers_mapping[answers[j]]).join('');
    const correct_answer_count = modelSequence.split('').reduce((count, correctAnswer, i) => count + (remapped_answers.charAt(i) === correctAnswer ? 1 : 0), 0);
    const empty_answer_count = remapped_answers.split('').reduce((count, answer) => count + (answer === '-' || answer === 'X' ? 1 : 0), 0);
    return {
        error,
        remapped_answers,
        score: correct_answer_count*5 + empty_answer_count,
        model: modelSequence,
        answers_mapping,
        questions_inverse_permutation,
        permAnswers,
    }
}

