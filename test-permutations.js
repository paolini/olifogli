const { decodePermutations } = require('./app/lib/schema/PERMUTATIONS');

function test() {
    const fs = require('fs');
    const filenames = [
        "2024Archimede-biennio-dic-students20250114.jsonl",
        "2024Archimede-biennio-nov-students20250114.jsonl",
        "2024Archimede-triennio-dic-students20250114.jsonl",
        "2024Archimede-triennio-nov-students20250114.jsonl"
    ];
    
    let totalLines = 0;
    let errors = 0;
    let absentCount = 0;
    
    for (const filename of filenames) {
        console.log(`\nProcessing ${filename}...`);
        
        const content = fs.readFileSync(filename, 'utf-8');
        const lines = content.trim().split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            try {
                const line = lines[i].trim();
                if (!line) continue;

                totalLines++;
                const data = JSON.parse(line);

                if (data.absent) {
                    absentCount++;
                    continue;
                }

                const variant = data.variant;
                const answersObj = data.answers;
                const expectedScore = data.score;
                
                // Converti l'oggetto answers in una stringa di 16 caratteri
                let answersString = '';
                for (let j = 1; j <= 16; j++) {
                    let answer = answersObj[j.toString()];
                    if (["'-", "", ".-", "--", "-."].includes(answer)) answer = '-'; // patch!
                    if (answer )
                    if (answer.length !== 1) throw new Error(`Risposta non valida "${answer}" per la domanda ${j} in ${filename}, riga ${i + 1}`);
                    answersString += answer
                }
                
                // Calcola il punteggio
                const result = decodePermutations(variant, answersString);
                const calculatedScore = result.score;
                
                // Verifica che coincida
                if (calculatedScore !== expectedScore) {
                    console.error(`\n❌ ERRORE trovato in ${filename}, linea ${i + 1}:`);
                    console.error(`   AnswersObj:`, answersObj);
                    console.error(`   Variant: ${variant}`);
                    console.error(`   Answers:  ${answersString}`);
                    console.error(`   Remapped: ${result.remapped_answers}`);
                    console.error(`   Model:    ${result.model}`);
                    console.error(`   Risposte permutate:`, JSON.stringify(result.permAnswers, null, 2));
                    console.error(`   Score atteso: ${expectedScore}`);
                    console.error(`   Score calcolato: ${calculatedScore}`);
                    console.error(`   Score difference: ${calculatedScore - expectedScore}`);
                    console.error(`   Dati completi:`, JSON.stringify(data, null, 2));
                    console.log(`ERRORE: ${filename},${i + 1},${calculatedScore},${expectedScore},${expectedScore - calculatedScore}`);
                    errors++;
                    // Termina al primo errore
                    // return;
                }
            } catch (error) {
                console.error(`Errore file ${filename}, riga ${i + 1}:`);
                throw error;
            }
        }    
        console.log(`✓ ${lines.length} righe verificate correttamente`);
    }
    
    console.log(`\n✅ Test completato!`);
    console.log(`   Totale righe testate: ${totalLines}`);
    console.log(`   Errori trovati: ${errors}`);
    console.log(`   Assenti saltati: ${absentCount}`);
}

// Esegui il test solo se il file viene eseguito direttamente (non importato)
if (require.main === module) {
    test();
}
