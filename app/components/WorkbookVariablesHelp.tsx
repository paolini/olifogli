import type { ReactNode } from 'react'

type Variable = { name: string, description: ReactNode }

// Keep in sync with the code that reads `Workbook.commonData`
// (`Schema.validationContext`, `buildPermutationObject`, `Distrettuale`,
// Olimanager resolvers). Documented in docs/architettura.md.
const SECTIONS: { title: string, variables: Variable[] }[] = [
    {
        title: 'Generali',
        variables: [
            {
                name: 'contest_year',
                description: <>Anno della gara (es. <code>2026</code>). Serve a segnalare le date di nascita con età anomale. È l&apos;unica variabile visibile anche ai docenti.</>,
            },
        ],
    },
    {
        title: 'Olimanager',
        variables: [
            {
                name: 'olimanager_contest_id',
                description: <>Codice del contest Olimanager usato da tutti gli schemi che non hanno una variabile specifica: trasferimento dei risultati, importazione dei partecipanti, aggiornamento delle taglie.</>,
            },
            {
                name: 'olimanager_<schema>_contest_id',
                description: <>Codice del contest per un singolo schema; ha la precedenza su <code>olimanager_contest_id</code>. Ad esempio <code>olimanager_archimede_biennio_contest_id</code> e <code>olimanager_archimede_triennio_contest_id</code>, salvati da «Crea fogli da Olimanager».</>,
            },
            {
                name: 'olimanager_olympiad_id, olimanager_edition_id',
                description: <>Olimpiade ed edizione selezionate in «Crea fogli da Olimanager»; vengono riproposte alla riapertura.</>,
            },
            {
                name: 'olimanager_taglia_field_id',
                description: <>Codice del campo aggiuntivo Olimanager in cui inviare la taglia della maglietta.</>,
            },
        ],
    },
    {
        title: 'Archimede e Gara delle prime (correzione con permutazioni)',
        variables: [
            {
                name: 'permutations_questions_<c>',
                description: <>Ordine delle domande per la cifra <code>c</code> (l&apos;ultima del codice compito): array JSON che permuta i numeri da 1 a n, es. <code>[3, 1, 2, …]</code>. Tutti devono avere la stessa lunghezza n.</>,
            },
            {
                name: 'permutations_answers_<c>',
                description: <>Ordine delle risposte per la cifra <code>c</code> (la seconda del codice compito): permutazione di <code>ABCDE</code>, es. <code>EDBCA</code>.</>,
            },
            {
                name: 'permutations_correct_<anno>',
                description: <>Chiave di correzione per la prima cifra del codice compito (<code>2</code> biennio, <code>3</code> triennio): n caratteri tra <code>A</code>–<code>E</code>, <code>X</code> e <code>-</code>. Senza suffisso (<code>permutations_correct</code>) vale per i codici compito di una sola cifra.</>,
            },
            {
                name: 'permutations_points_correct, _wrong, _empty, _invalid',
                description: <>Punti per risposta corretta, sbagliata, non data e non valida. Sono obbligatori tutti e quattro.</>,
            },
        ],
    },
    {
        title: 'Distrettuale',
        variables: [
            {
                name: 'correct_answers',
                description: <>Risposte corrette come array JSON, nell&apos;ordine dei campi risposta, risposte a scelta multipla come lettera e risposte numeriche come numero, es. <code>[&quot;B&quot;, &quot;D&quot;, …, &quot;42&quot;]</code>.</>,
            },
            {
                name: 'points_correct, points_wrong, points_empty, points_invalid',
                description: <>Punti per risposta corretta, sbagliata, non data e non valida; 0 se mancano.</>,
            },
        ],
    },
]

export default function WorkbookVariablesHelp() {
    return (
        <details className="mt-4 mb-2">
            <summary className="cursor-pointer font-medium">Variabili riconosciute</summary>
            <p className="my-2 text-sm">
                Scrivi i valori come stringhe: in YAML metti tra virgolette gli array
                JSON, ad esempio <code>&apos;[1, 2, 3]&apos;</code>. Le variabili non
                elencate sono conservate ma non vengono usate.
            </p>
            {SECTIONS.map(section => (
                <section key={section.title} className="mb-3">
                    <h3 className="font-medium">{section.title}</h3>
                    <dl className="text-sm">
                        {section.variables.map(variable => (
                            <div key={variable.name} className="py-1 sm:grid sm:grid-cols-[minmax(0,22rem)_1fr] sm:gap-4">
                                <dt className="font-mono break-all">{variable.name}</dt>
                                <dd>{variable.description}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </details>
    )
}
