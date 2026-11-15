# Architettura

## Processi

Olifogli è composto da quattro processi Node.js, più i servizi esterni:

```
Browser ──HTTP──► Next.js (porta 3000) ──publish──► Redis
Browser ──WS────► ws-server (porta 4001) ◄─subscribe── Redis
                  ws-server ◄── change stream ── MongoDB
                  olifogli-worker ──► MongoDB, Redis, Olimanager
```

- **Next.js** (`app/`): pagine, API REST e GraphQL via HTTP (query e mutation),
  esposto su `/graphql`.
- **ws-server** (`ws-server.ts`): solo subscription GraphQL via WebSocket.
  Carica lo stesso `schema.gql` e gli stessi resolver di Next.js.
- **olifogli-worker** (`olifogli-worker.ts`): lavori in background, vedi
  [worker.md](worker.md).
- **Redis**: Pub/Sub tra i processi e stato dei cursori.
- **MongoDB**: dati, in replica set (servono transazioni e change stream).

Redis serve perché in produzione Next.js gira su più istanze (`app1`, `app2`,
`app3`) dietro Nginx: le notifiche pubblicate da una qualunque istanza
raggiungono tutti i client collegati al `ws-server`. I dettagli del deploy sono
in [deploy.md](deploy.md).

La scansione OMR dei PDF e la generazione dei fogli personalizzati sono nel
progetto separato **archiomr** (worker Python `oliscan` e `olisheet`), che
comunica con Olifogli tramite directory condivise (`SCANS_SPOOL_DIR`,
`SCANS_DATA_DIR`, `SHEETGENDATA_DIR`) e le collezioni `scan_jobs`,
`scan_results` e `scan_sheet_jobs`. Vedi [omr.md](omr.md).

## Struttura del codice

```
app/
├── api/                  # Route REST: auth (NextAuth), upload, rows
├── components/           # Componenti React
├── graphql/
│   ├── schema.gql        # Schema GraphQL (fonte di verità)
│   ├── resolvers.ts      # Registro dei resolver
│   ├── resolvers/        # Un file per query/mutation/subscription
│   ├── generated.ts      # Generato da `npm run codegen`, non modificare a mano
│   └── route.ts          # Endpoint HTTP /graphql
├── lib/
│   ├── models.ts         # Tipi dei documenti MongoDB (fonte di verità)
│   ├── mongodb.ts        # Connessione e accesso alle collezioni
│   ├── schema.ts         # Registro degli schemi dei fogli
│   ├── schema/           # Schemi dei fogli: campi, validazione, punteggi
│   ├── pubsub.ts         # Redis Pub/Sub e topic
│   ├── redis.ts          # Redis chiave-valore (cursori)
│   └── olimanager*.ts    # Integrazione Olimanager e lavori in background
├── workbook/[workbookId] # Pagine del raccoglitore
├── sheet/[sheetId]       # Pagina del foglio
├── scan/, scansheet/     # Scansioni e fogli generati
└── users/                # Gestione utenti
migrations/               # Migrazioni migrate-mongo
scripts/                  # Script di manutenzione e setup Olimanager
tests/                    # Test automatici, vedi tests/README.md
ws-server.ts              # Server WebSocket
olifogli-worker.ts        # Worker dei lavori in background
```

## Dati

I tipi dei documenti sono definiti in `app/lib/models.ts`, che è la fonte di
verità; qui ne è riassunto il ruolo.

| Collezione | Contenuto |
|---|---|
| `users`, `accounts` | Utenti e account NextAuth; `isAdmin` e `isSupervisor` sono i ruoli globali |
| `workbooks` | Raccoglitori di fogli, con `commonData` chiave-valore |
| `sheets` | Fogli: `schema`, `permissions`, `commonData`, stato (`closed`, `locked`) e contatori denormalizzati |
| `rows` | Righe: `data` secondo lo schema del foglio, `error` di validazione, collegamento `olimanager`, eventuale `encrypted_data` |
| `scan_jobs`, `scan_results` | Importazione delle scansioni OMR |
| `scan_sheet_jobs` | Generazione dei fogli personalizzati |
| `settings` | Impostazioni globali |
| `olimanager_jobs`, `olimanager_job_items` | Lavori in background e singole righe |
| `olimanager_job_credentials` | Token OAuth delegati ai lavori (non esposti via GraphQL) |
| `olifogli_workers` | Segnale di presenza dei worker di Olifogli |
| `omr_workers` | Segnale di presenza dei worker archiomr, scritto da `oliscan` e `olisheet` (vedi [omr.md](omr.md)) |

I contatori di `sheets` (`nRows`, `nValidRows`, `nSyncedRows`, `anomalies`,
`nScanJobs`, `nScanSheetJobs`) sono aggiornati nella stessa transazione che
modifica le righe o i lavori collegati. Non sono modificabili via
`updateSheet`: se risultano disallineati, un amministratore li ricalcola dalle
righe con la mutation `recountSheet` (pulsante **Sincronizza** nel pannello del
foglio).

Le migrazioni usano `migrate-mongo` (`npm run migrate:status`, `migrate:up`,
`migrate:create`).

## Schemi dei fogli

Ogni foglio ha uno schema, registrato in `app/lib/schema.ts`: `ArchimedeBiennio`,
`ArchimedeTriennio`, `GaraPrime`, `Distrettuale`, `AmmissioneSenior`, `Scuole`,
`ImportazionePartecipantiDistrettuale`, `Distretti`. Lo schema definisce i campi,
la validazione delle righe e, per le gare, il calcolo del punteggio
(`Competition.computeDerivedData`).

Archimede e Gara delle prime calcolano il punteggio con le chiavi di correzione
e le permutazioni delle impostazioni `permutations_*` del raccoglitore, lette da
`buildPermutationObject` (`app/lib/schema/PERMUTATIONS.ts`) nel
`validationContext` dello schema. Senza queste impostazioni il contesto di
validazione segnala l'errore di configurazione.

Per aggiungere uno schema: creare la classe in `app/lib/schema/`, registrarla in
`app/lib/schema.ts` e, se serve la scansione OMR, aggiungere il template nel
progetto **archiomr**.

## Permessi

### Ruoli globali

- **Amministratore** (`isAdmin`): può fare tutto. Gli utenti in `ADMIN_EMAILS`
  ricevono il ruolo all'avvio dell'applicazione.
- **Supervisore** (`isSupervisor`): può vedere tutti i fogli, senza modificarli.

### Ruoli sul foglio

Ogni foglio ha un elenco `permissions` di coppie `{ email, role }`, con ruolo
`owner`, `admin`, `editor` o `view`.

### Stati del foglio

| Stato | Righe | Metadati e permessi | Chi cambia stato |
|---|---|---|---|
| Aperto (`closed=false`, `locked=false`) | `editor` o superiore | `admin` del foglio o owner | l'admin del foglio può chiudere |
| Chiuso (`closed=true`) | nessuno, nemmeno l'admin del foglio | `admin` del foglio | l'admin del foglio può riaprire; l'amministratore globale può bloccare |
| Bloccato/finalizzato (`locked=true`) | solo amministratori globali | solo amministratori globali | solo l'amministratore globale può sbloccare |

Flusso tipico: il foglio è aperto durante la raccolta dei dati, l'admin del
foglio lo chiude al termine, l'amministratore globale lo finalizza. Le operazioni
verso Olimanager richiedono fogli finalizzati. Un foglio riservato a un lavoro in
background (`olimanagerJobId`) non può essere sbloccato o riaperto.

## GraphQL

Lo schema è `app/graphql/schema.gql`; i resolver sono registrati in
`app/graphql/resolvers.ts`, uno per file in `app/graphql/resolvers/`. Dopo una
modifica allo schema o alle query del client va eseguito `npm run codegen`, che
rigenera `app/graphql/generated.ts`.

Per aggiungere un'operazione: dichiararla in `schema.gql`, scrivere il resolver
in `app/graphql/resolvers/`, registrarlo in `resolvers.ts`, eseguire
`npm run codegen` e riavviare il `ws-server`, che carica lo schema all'avvio.

## Aggiornamenti in tempo reale

### Subscription

| Subscription | Topic Redis o sorgente | Uso |
|---|---|---|
| `rowChanged(sheetId)` | `ROW_CHANGED.<sheetId>` | Riga aggiunta o modificata |
| `rowsDeleted(sheetId)` | `ROWS_DELETED.<sheetId>` | Righe cancellate (array di ID) |
| `sheetUpdated(sheetId)` | `SHEET_UPDATED.<sheetId>` | Metadati del foglio |
| `cursorChanged(sheetId)` | `CURSOR_CHANGED.<sheetId>` | Cursori degli altri utenti |
| `workbookUpdated(workbookId)` | `WORKBOOK_UPDATED.<workbookId>` | Qualcosa nel raccoglitore è cambiato |
| `scanJobUpdated(sheetId)` | change stream di `scan_jobs`, `scan_results` | Importazione scansioni |
| `scanSheetJobUpdated(sheetId)` | change stream di `scan_sheet_jobs` | Fogli generati |
| `olimanagerJobsUpdated` | change stream di `olimanager_jobs` | Lavori in background (solo amministratori) |

I topic sono definiti in `app/lib/pubsub.ts`. Le subscription basate sui change
stream ricevono anche gli aggiornamenti scritti dai worker esterni. Molte
subscription trasportano solo un segnale (`Boolean`): il client rilegge i dati
via HTTP.

### Connessione e autenticazione

Il client (`app/lib/webSocketConnection.ts`) si collega a
`ws://localhost:4001/graphql` in sviluppo e a `/ws/graphql` in produzione,
dove Nginx inoltra al `ws-server`.

Il `ws-server` autentica le connessioni con il cookie di sessione NextAuth
inviato dal browser, anche nella variante HTTPS `__Secure-` e suddiviso in
chunk; per questo deve avere gli stessi `NEXTAUTH_SECRET` e `NEXTAUTH_URL` di
Next.js. I parametri di connessione non autenticano l'utente: servono solo per
il `tabId`. Il trasporto WebSocket accetta solo subscription. La sessione viene
verificata alla connessione e a ogni nuova operazione. Il `ws-server` non serve
GraphQL via HTTP: le richieste HTTP ordinarie ricevono 404, query e mutation
passano solo da Next.js (`/graphql`).

Dopo il login il client apre la connessione e ne controlla la disponibilità,
anche prima di aprire un foglio. Se il servizio non risponde compare un avviso;
su `localhost` l'avviso indica anche il comando di avvio. Il client ritenta e
nasconde l'avviso quando il server conferma la connessione. Un ping ogni
15 secondi verifica che il servizio resti raggiungibile: senza pong entro
5 secondi la connessione viene chiusa e ritentata.

Ogni nuova iscrizione, anche dopo una riconnessione, provoca una rilettura dei
dati via HTTP per recuperare gli aggiornamenti persi.

### Permessi sulle subscription

Le subscription dei fogli (`sheetSubscription.ts`) verificano utente e permessi
di lettura in MongoDB al momento dell'iscrizione. Prima di consegnare un evento
li verificano di nuovo se l'ultimo controllo risale a più di
`SHEET_SUBSCRIPTION_RECHECK_MS` (30 secondi): una revoca, la rimozione
dell'utente o del foglio o la perdita del ruolo di amministratore chiudono la
subscription con un errore entro quell'intervallo. Anche un errore del database
durante il controllo chiude la subscription.

`workbookUpdated` è filtrata con `withFilter`. Il payload, costruito da
`workbookUpdatedPayload` (`app/lib/pubsub.ts`), contiene le email con accesso al
foglio (`_allowedEmails`) e il proprietario (`_ownerId`). Amministratori e
supervisori ricevono sempre l'evento, gli altri utenti solo se sono il
proprietario o se la loro email è nell'elenco; un payload senza elenco non
viene consegnato.

### Cursori condivisi

Gli utenti che guardano lo stesso foglio vedono la posizione dei cursori degli
altri, anche tra schede dello stesso utente.

1. Quando l'utente sposta il cursore, `Table.tsx` invia la mutation `moveCursor`
   (debounce di 300 ms).
2. Il resolver verifica il permesso di lettura sul foglio, pubblica
   `{ email, lineKey, fieldName, tabId }` su `CURSOR_CHANGED.<sheetId>` e salva
   il cursore nell'hash Redis `SHEET_CURSORS.<sheetId>` (campo
   `<userId>:<tabId>`, vedi `CURSOR_FIELD`); con `lineKey` nullo lo rimuove.
3. `Sheet.tsx` riceve `cursorChanged`, scarta il proprio cursore e aggiorna lo
   stato; `TableRow.tsx` evidenzia la cella attiva.

All'apertura del foglio la query `cursors(sheetId)`, riservata a chi può vedere
il foglio, legge l'hash Redis, così i cursori già presenti compaiono subito.
Alla disconnessione il `ws-server` rimuove dall'hash i cursori salvati da
quell'utente con quel `tabId` e, solo per quelli effettivamente rimossi,
pubblica un evento con `lineKey: null`.

Ogni scheda genera un `tabId` casuale (`crypto.randomUUID()`) tenuto solo in
memoria, così le schede duplicate non ereditano lo stesso ID. Il colore del
cursore deriva dall'email (`emailToColor`), quindi è stabile per ogni utente.

### Cancellazione delle righe

`deleteRow` pubblica `ROWS_DELETED.<sheetId>` con un solo ID; `deleteRows`
raggruppa gli ID e pubblica un evento per foglio. `Sheet.tsx` rimuove fino a 20
righe direttamente dalla cache Apollo; oltre, ricarica il foglio.

### Raccoglitori

Le mutation che modificano i dati di un raccoglitore (`addRow`, `patchRow`,
`deleteRow`, `deleteRows`, `updateSheet`, …) pubblicano
`WORKBOOK_UPDATED.<workbookId>`. I componenti del raccoglitore usano l'hook
`useWorkbookUpdated(workbookId, callback, delay=500ms)`, che ricarica i dati con
un debounce per assorbire le raffiche di eventi (per esempio un'importazione).

## Modifica delle celle

`Table` mantiene la cella attiva e le modifiche delle righe da salvare.
`useCellEditor` distingue navigazione e modifica: la bozza contiene cella, campo,
testo e selezione del cursore. Il primo carattere viene fornito come valore
iniziale, senza reinviare l'evento dopo il montaggio dell'input.

`Field.editKey` interpreta le regole specifiche del campo e restituisce valore,
posizione del cursore ed eventuale avanzamento, oppure un rifiuto esplicito che
conserva valore, selezione e modalità corrente. Nelle risposte i caratteri non
validi vengono rifiutati e `X` si inserisce solo con `X` o `x`. Testo normale e
cancellazioni interne restano affidati all'input nativo; date e risposte
implementano le proprie conversioni. `Table` esegue gli spostamenti e
`TableCellInput` applica focus e selezione con un layout effect, senza timer.

La conferma della bozza passa da `useCellEditor.commit`, che verifica
`Field.editingError` e normalizza il valore prima di aggiornare la riga. Una
conferma rifiutata mantiene la bozza e restituisce un esito esplicito che blocca
il cambio di cella o il salvataggio. `DateField` controlla calendario e limiti di
età rispetto all'anno della gara; il valore vuoto è consentito durante la
compilazione, anche se la validazione della riga richiede poi una data.

Negli schemi di gara, `affectsScore` identifica risposte, codice compito e
assenza. Una modifica confermata a questi campi avvia subito il salvataggio; le
modifiche arrivate durante una richiesta vengono inviate dopo la sua conferma. Il
vecchio punteggio viene nascosto durante la modifica e in attesa del risultato.
Il calcolo resta sul server, dove sono disponibili le chiavi di correzione:
`Competition.computeDerivedData` calcola il punteggio indipendentemente dai dati
anagrafici, conservando gli errori di validazione della riga. Risposte incomplete
o non valide, codice compito non valido e assenza producono un punteggio vuoto.
L'errore è mostrato accanto all'input con `aria-invalid` e un messaggio
accessibile.

Cambi di cella, Invio, Esc e perdita del focus usano questo percorso. Esc
conferma, salva e torna in navigazione quando il valore è accettato.
L'autosalvataggio conferma una copia normalizzata senza alterare testo e cursore
della bozza attiva. Le risposte del server eliminano solo le modifiche
effettivamente salvate, conservando quelle successive.

Se un salvataggio fallisce (errore GraphQL, per esempio un conflitto con la
modifica di un altro utente, o errore di rete), la riga torna modificabile,
conserva i valori non salvati e mostra l'errore in una riga sotto di essa
(`Line.error`). L'autosalvataggio non ritenta una riga in errore: la nuova
modifica di una cella o l'uscita dalla riga la salvano di nuovo. Gli avvisi
generati durante la riconciliazione delle righe (riga modificata o cancellata da
altri) sono mostrati dopo il render, non dentro gli aggiornamenti di stato.
Nella linguetta dei dati la tabella è in sola lettura sui fogli chiusi o
finalizzati; gli amministratori li modificano dalla linguetta **⚙ MODIFICA DATI**.

`Sheet.tsx` ignora gli eventi `rowChanged` generati dalla propria scheda
(`sourceTabId`). Per questo, dopo `addRow`, `Table.tsx` aggiunge la riga creata
alla lista `rows` in cache (`cache.modify`); se la riga arriva comunque prima
della risposta, `acknowledgeSave` tiene una sola riga.

## Report del raccoglitore

Le pagine del raccoglitore mostrano, nel rispetto dei permessi dell'utente, solo
i dati dei fogli accessibili:

- **Risultati**: classifica per punteggio, separata per Archimede Biennio e
  Triennio;
- **Distribuzione**: grafico della distribuzione dei punteggi;
- **Configurazione**: campi `commonData` del raccoglitore ed eliminazione.

## Autenticazione

- Provider: Olimanager, OAuth2/OIDC con authorization code e PKCE, tramite
  NextAuth. Configurazione in [olimanager.md](olimanager.md#login-oauth).
- Sessione: JWT firmato con `NEXTAUTH_SECRET`, in cookie HttpOnly.
- Scope: `openid email profile`; lo scope `api` si richiede solo per trasferire
  dati verso Olimanager.

## Log

Cosa viene registrato e come si conservano i log è descritto in
[deploy.md](deploy.md#log-applicativi-e-conservazione).
