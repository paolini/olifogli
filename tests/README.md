# Test automatici

Eseguire dalla radice del repository, con le dipendenze di sviluppo installate:

```sh
npm test
```

Si usa il test runner integrato in Node.js (Node 20 o successivo).
TypeScript traspila i moduli per i test; jsdom 26, dipendenza di sviluppo,
fornisce il DOM per i test dei componenti React.
Non sono necessari `.env`, credenziali, MongoDB, Redis o porte di rete.

`workbook-navigation.test.cjs` monta il componente Workbook e la gestione reale
dei filtri URL in jsdom. Verifica selezione della linguetta, ripristino dopo reload,
conservazione della linguetta cambiando filtri e ordinamento, e aggiornamento
della pagina quando cambiano i parametri URL. Il montaggio dei filtri non deve
riscrivere l'URL né cancellare il parametro della linguetta.

`participant-distribution.test.cjs` verifica i conteggi per anno di corso,
inclusi dati mancanti e non validi, indipendentemente dalla data di nascita.
Controlla che le statistiche per età restino invariate, che i report rispettino
i fogli selezionati e restino separati per schema, e che la pagina presenti
entrambi i grafici con etichette e conteggi distinti.
Il totale studenti è comune ai due grafici; le età mancanti sono conteggiate
separatamente e non entrano nel calcolo di media e varianza.

`table-editing.test.cjs` monta i componenti reali `Table`, `TableBody`, `TableRow`
e `TableRowCell` con React DOM e jsdom. Verifica primo carattere e posizione del
cursore, apertura con F2/Invio/clic, cancellazione, navigazione, salvataggio al
cambio riga e con Esc, risposte a carattere singolo con avanzamento automatico,
scorciatoie, separatori delle date e svuotamento. Copre inoltre campi sincronizzati
e non modificabili, salvataggi asincroni, nuove righe e autosalvataggio senza
perdita della bozza o della posizione del cursore. Il DOM gestisce focus ed eventi;
gli intervalli di autosalvataggio sono eseguiti esplicitamente, senza attese reali.
Sono simulati rete, toolbar e intestazione. Gli avanzamenti e il posizionamento
del cursore nell'editor non richiedono timer.
I test fissano il comportamento corrente, compreso Esc che salva ed esce.
La #31 è coperta da casi di date impossibili, parziali o fuori intervallo,
anni bisestili e limiti di età riferiti all'anno della gara. I test verificano
messaggio accessibile, blocco di navigazione/clic/blur/autosalvataggio e ripresa
dopo la correzione o lo svuotamento. Per la #23 verifica che i caratteri non validi
nelle risposte, incluso `9`, conservino valore, selezione e focus sia in navigazione
sia in editing; `X` si inserisce solo con `X` o `x`.

Per la #30 monta anche uno schema di gara reale con 16 risposte e correzioni
sintetiche: verifica il ricalcolo al salvataggio senza attendere il timer,
la rimozione dei punteggi obsoleti, le modifiche durante richieste in corso,
il cambio di codice compito e il calcolo senza dati anagrafici. Risposte
incomplete o non valide e assenza svuotano il punteggio; lo zero rimane visibile.
Il test IME verifica che i keydown durante la composizione non attivino la
navigazione. Non è un collaudo in un browser reale: la composizione completa,
il layout e le azioni native di digitazione richiedono verifiche separate.

La suite verifica i callback reali del server WebSocket usando cookie cifrati
generati da NextAuth: sessioni valide (anche HTTPS e cookie suddivisi in chunk),
sessioni scadute o alterate, segreti errati e tentativi di impersonificazione.
Verifica inoltre il rifiuto di query e mutation, il controllo della sessione a
ogni nuova operazione e la ricezione di un evento da una subscription autorizzata.
Database, rete e resolver applicativi sono isolati: l'evento usa un resolver di
prova e non sostituisce un collaudo con MongoDB e Redis.

In ambienti isolati che non consentono al runner di gestire correttamente i
processi figli, con Node 22.8 o successivo si può usare:

```sh
node --test --experimental-test-isolation=none tests/*.test.cjs
```

`auth-redirect.test.cjs` verifica la validazione condivisa dei redirect e i
callback GET reali di `/api/auth/logout` e `/api/auth/callback`. Copre percorsi
interni, query e frammenti, destinazioni esterne, backslash, caratteri di
controllo e codifiche annidate. MongoDB e la verifica JWT della callback sono
sostituiti da dipendenze isolate: questi test verificano i redirect e i cookie,
non il protocollo OAuth completo. La callback personalizzata è mantenuta perché
è ancora referenziata da `OlimanagerLoginButton`, usato nella pagina `/login`.

`workbook-common-data.test.cjs` esegue query GraphQL sui resolver reali di
`workbook`, `workbooks`, `sheet` e `sheets`, con database e autenticazione isolati.
Verifica che `Workbook.commonData` esponga ai docenti soltanto i campi della
costante `TEACHER_READABLE_WORKBOOK_FIELDS` (`contest_year`), anche attraverso
alias e frammenti. Amministratori e
supervisori mantengono tutti i campi; `Sheet.commonData` rimane invariato.
Il test del contesto di visualizzazione verifica che Archimede possa essere
visualizzato senza chiavi di correzione, mantenendo rigorosa la validazione
server. Questa protezione riguarda la configurazione del workbook: le risposte
corrette già incluse nei risultati delle righe restano visibili come previsto.

`csv-export.test.cjs` verifica la serializzazione condivisa `unparseCsv`, usata
per gli export delle righe del foglio (anche selezionate o depermutate),
dell'elenco dei fogli e della classifica. I valori testuali e le intestazioni
che iniziano con `=`, `+`, `-`, `@`, tab o ritorni a capo ricevono un apostrofo
tramite `escapeFormulae`; il controllo copre anche formule su più righe.
I test rileggono il CSV con Papa Parse per verificare separatori, virgolette,
Unicode, celle vuote e numeri. L'apostrofo aggiunto ai testi sospetti è parte
del CSV e può essere visibile quando il file viene letto da altri programmi.
Non viene eseguito un collaudo automatico in Excel o LibreOffice.


`logging.test.cjs` verifica il plugin GraphQL, i log WebSocket e la diagnostica
con valori personali/segreti sintetici, nomi di operazione e alias ostili,
errori e codici non riconosciuti. Controlla anche i file giornalieri prodotti.
La pulizia viene provata esclusivamente in directory temporanee: limite dei
30 giorni UTC, vecchi formati, dry-run, esecuzioni ripetute, configurazioni
invalide, date non valide, file estranei, directory e link simbolici.

`create-sheets.test.cjs` esegue il resolver e i controlli di autorizzazione reali
con collezioni simulate: anonimi e utenti senza privilegi amministrativi globali
vengono bloccati prima di accedere ai dati di importazione, anche se il contesto
dichiara `isAdmin`. Verifica importazioni amministrative su fogli nuovi ed
esistenti, righe, permessi, dry-run e rifiuto dei permessi importati non validi.

`sheet-subscriptions.test.cjs` verifica i resolver delle sei subscription dei
fogli con i controlli di autorizzazione reali e MongoDB/Redis simulati. Copre
utenti anonimi e senza accesso, tutti i ruoli di lettura, isolamento tra fogli,
assenza di letture MongoDB per evento e chiusura dell'iteratore Redis.

Le subscription verificano utente e permessi del foglio solo all'iscrizione.
I test verificano che le subscription esistenti continuino a ricevere eventi
dopo una revoca, mentre le nuove iscrizioni siano respinte. Per applicare una
revoca alle subscription esistenti occorre riavviare tutte le istanze WebSocket,
come descritto nel README. I ruoli memorizzati nel contesto WebSocket non
sostituiscono il controllo nel database all'iscrizione.

`scan-image.test.cjs` esegue la route reale delle immagini con autorizzazione
reale, database simulato e file sintetici in directory temporanee. Verifica
immagini PNG/JPEG/WebP/GIF autorizzate, ID e nomi non validi, traversal anche
codificato, file mancanti, directory e link simbolici verso altri job o file
esterni. Controlla inoltre la sostituzione del file con un link prima
dell'apertura e la chiusura dei descrittori. Non richiede scansioni reali né
esegue un test del routing HTTP attraverso un server Next.js avviato.
