# Test automatici

Eseguire dalla radice del repository, con le dipendenze di sviluppo installate:

```sh
npm test
```

Si usa il test runner integrato in Node.js (Node 20 o successivo), senza nuove
dipendenze. TypeScript, già presente nel progetto, traspila il server per il test.
Non sono necessari `.env`, credenziali, MongoDB, Redis o porte di rete.

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
costante `TEACHER_READABLE_WORKBOOK_FIELDS` (`contest_year` e
`selection_workbook_id`), anche attraverso alias e frammenti. Amministratori e
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
revoca dei permessi e dei ruoli globali, cancellazione di utenti e fogli,
errori del database e chiusura dell'iteratore Redis.

Le subscription verificano utente e permessi del foglio all'iscrizione e prima
di consegnare ogni evento. Se l'accesso viene revocato, l'evento successivo non
viene consegnato e la subscription termina. I ruoli memorizzati nel contesto
WebSocket non sostituiscono il controllo aggiornato nel database.
