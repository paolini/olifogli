Olifogli è un sistema web per l'introduzione dei risultati delle gare di matematica da parte dei docenti delle scuole partecipanti. Il sistema è progettato per essere modulare, scalabile e sicuro, con un'architettura basata su Next.js, GraphQL e MongoDB.
I docenti e gli amministratori utilizzano le credenziali del sistema 
olimanager https://olimpiadi-scientifiche.it per autenticarsi tramite OAuth2. Il sistema supporta la gestione di più workbook, fogli e righe di dati, con un sistema di permessi strutturato per garantire la sicurezza e l'integrità dei dati.

## 

## Local development

Store your local configuration in the `.env` file. Adjust the followings lines to your needs:

```
MONGODB_URI=mongodb://127.0.0.1:27017/olifogli?directConnection=true
REDIS_URL=redis://127.0.0.1:6379
NEXTAUTH_SECRET=<random_string>
NEXTAUTH_URL=http://localhost:3000
OLIMANAGER_OAUTH_CLIENT_ID=...
OLIMANAGER_OAUTH_CLIENT_SECRET=...
OLIMANAGER_URL=https://staging.olimpiadi-scientifiche.it
ADMIN_EMAILS=myemail@somewhere.com
SCANS_SPOOL_DIR=<path_to_worker_spool_directory>
SCANS_DATA_DIR=<path_to_worker_data_directory>
```

### Avvio locale

Servono quattro processi: MongoDB (porta 27017), Redis (porta 6379),
Next.js (porta 3000) e il server WebSocket (porta 4001).
`npm run dev` avvia soltanto Next.js.

1. Con Docker e Docker Compose installati, avvia MongoDB e Redis dalla radice
   del repository usando il file `docker-compose.yml` di esempio:

   ```bash
   docker compose up -d --wait db redis
   docker compose exec redis redis-cli ping
   ```

   Redis deve rispondere `PONG`. Il Compose configura MongoDB come replica
   set, necessario per i change stream del server WebSocket, e conserva i dati
   MongoDB nella directory `database/`. Entrambi i servizi sono esposti solo
   sull'interfaccia locale. Se hai già MongoDB e Redis disponibili, puoi usare
   quelli configurando `MONGODB_URI` e `REDIS_URL` in `.env`; MongoDB deve comunque
   essere un replica set. Le porte 27017 e 6379 devono essere libere per avviare
   i servizi dell'esempio.

2. Dalla radice di Olifogli, installa le dipendenze al primo avvio o dopo un
   aggiornamento del lockfile:

   ```bash
   npm ci
   ```

3. Avvia Next.js in un terminale, dalla radice di Olifogli:

   ```bash
   npm run dev
   ```

4. Avvia il server WebSocket in un secondo terminale, sempre dalla radice di
   Olifogli, e lascia entrambi i terminali aperti:

   ```bash
   npm run ws-server:watch
   ```

   `ws-server:watch` riavvia automaticamente il server quando cambiano i file.
   Per avviarlo senza riavvio automatico, usa `npm run ws-server`.
   Entrambi i comandi terminano prima l'eventuale processo sulla porta 4001.

5. Apri [http://localhost:3000](http://localhost:3000) ed effettua il login.
   Usa `localhost` anche nell'URL del browser: il client locale si collega a
   `ws://localhost:4001/graphql`. Se Next.js usa un'altra porta, adegua
   `NEXTAUTH_URL` e l'URI di callback OAuth; il WebSocket resta sulla porta 4001.

In caso di `Socket closed`, controlla il terminale WebSocket: deve mostrare
`GraphQL HTTP+WS server listening on http://localhost:4001/graphql` e non
segnalare errori successivi di MongoDB o Redis. Verifica inoltre che il login
sia valido e che i due server ricevano la stessa configurazione NextAuth.

Dopo il login il client apre la stessa connessione WebSocket usata dalle
subscription e ne controlla la disponibilità, anche prima di aprire un foglio.
Se il servizio non risponde compare un avviso sugli aggiornamenti in tempo reale;
su `localhost` indica anche il comando di avvio. Il client ritenta la connessione
e nasconde l'avviso quando il server conferma la connessione. Un ping ogni 15
secondi verifica che il servizio resti raggiungibile: senza pong entro 5 secondi
la connessione viene terminata e ritentata. Un errore di autenticazione può
richiedere un nuovo accesso o il ricaricamento della pagina.

Il server WebSocket deve ricevere gli stessi `NEXTAUTH_SECRET` e `NEXTAUTH_URL`
dell'app Next.js. Avviarlo dalla radice del progetto con `npm run ws-server`
(oppure `npm run ws-server:watch` durante lo sviluppo) in
un terminale separato: carica `.env` senza sovrascrivere le variabili già presenti
nell'ambiente e si arresta con un errore esplicito se manca `NEXTAUTH_SECRET`.
Autentica le connessioni tramite il cookie di sessione NextAuth
inviato dal browser (anche nella variante HTTPS `__Secure-` e suddiviso in chunk).
I token nei parametri di connessione non vengono usati per autenticare l'utente.
Il trasporto WebSocket accetta solo subscription; query e mutation passano via
HTTP. La sessione viene verificata alla connessione e a ogni nuova operazione.

Le subscription dei fogli verificano l'utente e i permessi di lettura in MongoDB
all'iscrizione. I singoli eventi non rileggono i permessi: le subscription già
aperte conservano l'accesso fino alla disconnessione. Questa scelta presuppone
che durante il normale utilizzo non siano necessarie revoche immediate.
Per rendere effettiva una revoca di accesso o di un ruolo globale anche sulle
subscription esistenti, aggiorna prima i permessi e poi riavvia **tutte le istanze
del server WebSocket**. Le connessioni vengono chiuse e le nuove iscrizioni
verificano i permessi aggiornati; riavviare soltanto Next.js non basta.

Eseguire `npm test` per i [test di regressione](tests/README.md).

Le schede di importazione scansioni e dei PDF generati si aggiornano tramite
WebSocket: il server osserva `scan_jobs`, `scan_results` e `scan_sheet_jobs`,
inclusi gli aggiornamenti scritti dai worker esterni. Le eliminazioni effettuate
dall'app notificano gli altri browser dopo la transazione. Ogni nuova iscrizione,
anche dopo una riconnessione, provoca una rilettura dei dati via HTTP per
recuperare eventuali aggiornamenti persi. Riavviare il server WebSocket dopo
gli aggiornamenti al suo codice.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## integration with OMRChecker

See https://github.com/fph/archiomr/blob/main/worker.py

set SCANS_SPOOL_DIR and SCANS_DATA_DIR to enable

## Dati di prova Archimede su Olimanager

Il comando seguente verifica la configurazione senza creare dati:

```sh
npm run olimanager:setup
```

Per creare gli oggetti mancanti e salvare gli ID e le anagrafiche di prova:

```sh
npm run olimanager:setup -- --apply --output /tmp/olifogli-archimede.json
```

Lo script è JavaScript per Node.js e usa le dipendenze npm del progetto (`dotenv`
per `.env`, `parse5` per i moduli Django). Servono inoltre curl e un account con
accesso al pannello Django; non richiede Python o pip. Il comando usa lo staging
e le sue credenziali pubbliche di test come impostazione predefinita.
Sullo staging, username e password non impostati o vuoti usano l'account pubblico
`admin@olimanager.it`, con password uguale all'email.
Un'altra istanza si seleziona con `--url https://istanza.example` e
`--username admin@example.it`, impostando `OLIMANAGER_SETUP_PASSWORD` nell'ambiente.
L'URL deve essere quello di base, senza `/graphql`. Sono disponibili anche
`OLIMANAGER_SETUP_URL` e `OLIMANAGER_SETUP_USERNAME`. Lo script legge `.env`
senza modificarlo; le variabili già esportate nell'ambiente hanno precedenza.
La lettura usa il package `dotenv` con `override: false`.
La destinazione del setup resta lo staging salvo `--url` o
`OLIMANAGER_SETUP_URL` espliciti: `OLIMANAGER_URL` viene usato per il confronto
con la configurazione dell'app, non per scegliere il server da modificare.

Si possono indicare `--year 2026`, `--student EMAIL` e `--teacher EMAIL`.
Lo studente deve avere un profilo delle superiori (anni scolastici 9–13);
la sua scuola e gli account vengono riutilizzati. Senza selezione esplicita,
lo script cerca gli account disponibili nel database.

La struttura creata comprende un'olimpiade di test, un'edizione, l'iscrizione
della scuola e due gare scolastiche: **Archimede Biennio** e **Archimede Triennio**.
Ogni gara ha una sede amministrata dal docente e 16 problemi, numerati da 1 a 16,
con punteggi ammessi da 0 a 5. Gli oggetti esistenti sono riutilizzati senza
aggiornarli o cancellarli; la procedura può riprendere dopo un'interruzione.

Lo studente con account viene iscritto alla gara appropriata. Per ciascuna gara
viene creato anche un concorrente senza account; un'ulteriore anagrafica viene
inclusa solo nel manifest, per provare successivamente la creazione da Olifogli.
Non vengono inviati risultati né creati workbook.

Il setup configura anche l'applicazione OAuth **Olifogli locale**, di tipo
Confidential, flusso Authorization code, firma OIDC RS256, consenso esplicito
e client secret salvato come hash su Olimanager. Il callback predefinito è
`http://localhost:3000/api/auth/callback/olimanager` (compatibile con PKCE e state
già utilizzati da Olifogli). Il server emette i token degli utenti al login;
il setup crea soltanto l'applicazione.

Per verificare o creare soltanto l'applicazione OAuth:

```sh
npm run olimanager:setup -- --oauth-only
npm run olimanager:setup -- --oauth-only --apply
```

Le credenziali vengono stampate nell'output da copiare manualmente in `.env`:
lo script non crea file delle credenziali e non modifica `.env`.
Confronta client ID, secret, URL di Olimanager, `OLIMANAGER_GRAPHQL_ENDPOINT` e `NEXTAUTH_URL`
con `.env` e l'ambiente; stampa solo le assegnazioni da correggere.
Il secret locale viene verificato contro l'hash PBKDF2 conservato da Django.
`OLIMANAGER_GRAPHQL_ENDPOINT` è usata da tutte le richieste a Olimanager.
Sostituisce il precedente nome `OLI_GRAPHQL_ENDPOINT`.
Abbinamenti, risultati ed extra fields usano il token OAuth della sessione
dell’amministratore, letto solo sul server: il browser non richiede né invia
username o password. Restano necessari i privilegi amministrativi locali e
i permessi richiesti da Olimanager per ciascuna operazione.
I fogli devono essere finalizzati (`locked`) dall'amministratore prima di
abbinamenti, invio risultati o aggiornamento degli extra fields: la sola
chiusura da parte dell'insegnante non basta.
Il login richiede normalmente solo `openid email profile`. Per trasferire dati,
selezionare «richiesta scope api» accanto a LOGIN:
quel login richiederà anche lo scope `api`, senza assegnare ulteriori ruoli.
Per cambiare la scelta di una sessione già aperta occorre uscire e rifare il login.
La sessione pubblica espone solo `olimanagerApiScope` (true/false, oppure null
per sessioni non verificabili), senza il token. I comandi di trasferimento restano
disponibili: scope e scadenza vengono controllati sul server solo quando si tenta
un trasferimento, prima di elaborare le righe o contattare Olimanager.
Se il controllo fallisce, viene mostrato il messaggio con le istruzioni per rifare il login.
Dopo aver copiato le righe occorre riavviare Olifogli. Il manifest JSON resta privo di secret.

Se il secret è perso o non valido, si può sostituirlo mantenendo lo stesso client ID:

```bash
npm run olimanager:setup -- --oauth-only --oauth-regenerate-secret --apply
```

Il precedente secret viene invalidato; copiare il nuovo valore dall'output nel `.env`.
Senza `--apply` viene mostrata solo l'anteprima. I rilanci normali non cambiano
le credenziali esistenti. Dopo un reset del database, le credenziali del `.env`
vengono riutilizzate se URL di Olimanager e `NEXTAUTH_URL` corrispondono.
Se una richiesta fallisce dopo l'invio, lo script stampa le credenziali proposte:
conservare l'output e verificarle con un rilancio normale dopo averle copiate in `.env`.

Per altri client o istanze sono disponibili `--oauth-name` e `--oauth-redirect-uri`.

Il manifest contiene `contests.biennio`, `contests.triennio`, `workbookCommonData`,
`sheetCommonData` e le righe di prova, con `olifogliData` pronto per i campi delle
righe di Olifogli. La configurazione usa le permutazioni Archimede 2025 fornite
per i test, conservate in `scripts/fixtures/archimede.json`: codice iniziale `2`
per il biennio, `3` per il triennio; corretta 5, vuota 1, errata o non valida 0.
L'anno e gli ID vengono impostati durante il setup. `participantId` nel manifest
identifica le partecipazioni già predisposte; non viene importato in Olifogli
automaticamente.

## OAuth2 Setup (olimanager ↔ olifogli)

olifogli authenticates against olimanager's OAuth2/OIDC provider via NextAuth, using the standard authorization code flow with PKCE. The relevant endpoints (authorize, token, userinfo, discovery) are exposed by olimanager's Django backend, not its Next.js frontend — the two are served on different origins.

**Local development:** olimanager runs as two separate services: the Next.js frontend on port 3000 and the Django backend on port 8000. Set OLIMANAGER_URL in olifogli's .env to http://localhost:8000 (not 3000). The callback/redirect URI is http://localhost:3001/api/auth/callback/olimanager.

** Production:** frontend and backend are served under the same public domain (e.g. https://olimpiadi-scientifiche.it), with routing (proxy/CDN) handling the split internally, so OLIMANAGER_URL should simply be the public domain. The callback/redirect URI is https://fogli-olimat.olimpiadi-scientifiche.it/api/auth/callback/olimanager.
OAuth2 Application configuration (both environments): a corresponding Application must exist in Django admin (/admin/oauth2_provider/application/) with:

client_type: Confidential
authorization_grant_type: Authorization code
redirect_uris: the appropriate callback URL above
algorithm: RSA with SHA-2 256 (RS256) — required whenever the openid scope is requested. If left unset, the token endpoint will fail with a 500 error (ImproperlyConfigured: This application does not support signed tokens) when trying to issue the id_token. This also requires OAUTH2_PROVIDER["OIDC_RSA_PRIVATE_KEY"] to be configured in Django settings for that environment.

⚠️ Client secret: the plaintext client_secret is displayed only once, on the confirmation screen right after creating the Application — copy it immediately into the corresponding env variable (OLIMANAGER_OAUTH_CLIENT_SECRET). If lost, regenerate it with `npm run olimanager:setup -- --oauth-only --oauth-regenerate-secret --apply`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

Tested deployment with docker-compose-production.yml for a template configuration file.

### Aggiornamenti di sicurezza delle dipendenze (#49)

Usare Node.js 24 LTS, come nell'immagine Docker, nella CI e in `.nvmrc`.
Con nvm eseguire `nvm install` e `nvm use` nella radice del repository.
Il lockfile
include Next.js 16.4.3, React/React DOM 19.2.9, NextAuth 4.24.15 e Apollo Server 5.
Il servizio WebSocket usa l'adattatore `@as-integrations/express5`, compatibile
con Express 5. I tipi Express e body-parser sono dipendenze di sviluppo esplicite.

`sharp` è una dipendenza esplicita con versione minima 0.35.5 per includere le
correzioni delle librerie native usate nell'ottimizzazione delle immagini.
Next.js 16 include PostCSS 8.5.23, successivo alle correzioni richieste: non è
più necessario l'override usato con Next.js 15.

Sviluppo e build usano Turbopack, predefinito in Next.js 16. Le route server
leggono già `params` in modo asincrono. L'autenticazione rimane su NextAuth.
Il lint usa direttamente ESLint con la configurazione flat di Next.js 16:
`next lint` non è più disponibile e la build non esegue il lint automaticamente.
La CI esegue quindi `npm run lint` separatamente. Le nuove diagnostiche React
Compiler sui pattern già presenti nei componenti sono mantenute come avvisi
nei soli file interessati; React Compiler non è abilitato.
Gli accessi ai volumi di scansioni e PDF generati sono esclusi dal tracciamento
Turbopack tramite `turbopackIgnore`: questi dati devono essere disponibili a
runtime nei volumi configurati, senza essere inclusi nell'immagine standalone.

Prima di distribuire un aggiornamento:

```sh
npm ci
npm test
npm run lint
npm audit --omit=dev
npm run build
```

La CI esegue test, lint e audit prima di costruire e pubblicare l'immagine. Dopo la
pubblicazione, l'amministratore deve aggiornare tutti i servizi che usano
l'immagine (app, WebSocket e worker) e verificare le versioni effettive nei
container. Collaudare login OAuth, navigazione dei fogli, upload PDF e ricezione
degli aggiornamenti tramite sottoscrizioni. I test isolati non sostituiscono
questo collaudo del deploy con MongoDB, Redis e il provider OAuth reali.


## Log applicativi e conservazione

I log GraphQL registrano soltanto timestamp UTC, identificativo casuale della
richiesta, tipo di operazione, nomi dei campi radice definiti nello schema,
durata, esito e codici di errore ammessi. Non registrano nomi di operazione o
alias scelti dal client, variabili, identità, payload, messaggi di errore liberi
o stack trace. I log WebSocket contengono il tipo di evento e i codici di errore,
senza payload, tabId o identificativi delle operazioni forniti dal client.
La diagnostica applicativa usa identificatori statici degli eventi e categorie
di errore: i dettagli dei dati restano disponibili nell'interfaccia autorizzata,
non nei log. Non usare `console.log` su richieste, risposte, configurazioni o
errori grezzi; per gli errori usare `logDiagnostic` con un evento statico.

Se `LOG_DIR` è configurata, i log GraphQL vengono anche scritti nei file
`graphql-YYYY-MM-DD.log` e `graphql-errors-YYYY-MM-DD.log`. La rotazione è
giornaliera, secondo UTC. I nuovi file vengono creati con permessi `0600`.

La pulizia è un comando esplicito, senza timer nell'applicazione:

```bash
# Anteprima: nessuna cancellazione
npm run logs:cleanup -- --dry-run

# Cancella i file scaduti
npm run logs:cleanup
```

Configurare `LOG_DIR` e, facoltativamente, `LOG_RETENTION_DAYS` in ambiente o
`.env`. Il valore predefinito è **30**: si conservano il giorno UTC corrente e
i 29 precedenti. La data nel nome determina la scadenza, anche per i log del
vecchio formato; la data di copia/modifica del file non prolunga la conservazione.
Il comando esamina solo i file regolari con i due nomi previsti direttamente
in `LOG_DIR`; ignora link simbolici, sottodirectory, backup e nomi non validi.
Una directory mancante, una configurazione non valida o errori di cancellazione
producono un codice di uscita non zero. La directory deve essere accessibile e
scrivibile dall'utente del container.

Con l'immagine aggiornata e il Compose di produzione del repository:

```bash
# Container già avviato
docker compose -f docker-compose-production.yml exec -T app1 npm run logs:cleanup -- --dry-run

# Funziona anche fuori stagione, con i servizi spenti: usa lo stesso volume logs
docker compose -f docker-compose-production.yml run --rm --no-deps -T app1 npm run logs:cleanup
```

Il sistema ospitante deve pianificare il comando, ad esempio una volta al giorno.
Esempio di crontab da adattare al percorso del deployment e del comando Docker:

```cron
0 3 * * * cd /srv/olifogli && /usr/bin/docker compose -f docker-compose-production.yml run --rm --no-deps -T app1 npm run logs:cleanup
```

Basta un servizio applicativo per pulire il volume condiviso. La conservazione
è applicata soltanto quando il comando viene eseguito: monitorarne gli errori e
lasciare il cron attivo anche nei periodi di chiusura dell'applicazione. Alla
prima esecuzione verranno eliminati anche i vecchi file giornalieri scaduti; i
file più recenti del vecchio formato possono ancora contenere dati personali.

I Compose di produzione limitano i log console dei container applicativi e,
dove presente, WebSocket a tre file da 10 MB tramite il driver Docker `local`.
Questo è un limite di dimensione, **non** una scadenza di 30 giorni. Si applica ai
container ricreati con la nuova configurazione. I log di vecchi container,
reverse proxy, servizi esterni e backup richiedono una politica separata sul
sistema ospitante: questo comando non li elimina. Gli access log Nginx degli
esempi contengono solo tempo, stato, durata e dimensione della risposta; gli
error log del proxy possono ancora includere dettagli della richiesta e vanno
gestiti separatamente. Il logging delle URL delle richieste in sviluppo Next.js
è disabilitato per non registrare parametri OAuth.

## Worker Olifogli: lavori in background

Il worker gestisce verifiche e trasferimenti Olimanager, cifratura e decrittazione
dei fogli. Per le verifiche legge i collegamenti esistenti e confronta nome,
cognome, data di nascita, anno di corso e sezione con Olimanager. Controlla anche
gara e scuola. Le righe senza `participantId` vengono segnalate come non abbinate:
non cerca nuovi abbinamenti, non crea partecipanti, non invia risultati e non
modifica le righe del foglio.
Il comando **«Crea/abbina partecipanti in background (Olimanager)»** usa invece
`matchOrCreateParticipant` per le righe selezionate o per tutti i fogli selezionati.
Può creare concorrenti e partecipanti su Olimanager. Il risultato viene salvato
sulla riga locale insieme all’ID gara, nella stessa transazione dell’esito del job.
Le righe assenti vengono saltate; quelle non valide o criptate producono un errore
nel dettaglio del lavoro. I collegamenti già presenti vengono verificati in sola
lettura: non vengono sostituiti né migrati verso un’altra gara. Il pannello distingue
partecipanti creati, trovati e già collegati, e segnala gli abbinamenti multipli
restituiti da Olimanager. Non vengono inviati risultati né extra fields.

Il comando **«Invia risultati in background (Olimanager)»** accoda invece un lavoro
`update_results`. Per ogni riga valida non assente controlla il collegamento remoto
(gara, scuola e anagrafica), estrae i punteggi dei singoli esercizi con lo schema
del foglio e verifica che la loro somma corrisponda al totale locale. Le righe non
collegate producono un errore: occorre prima creare/abbinare il partecipante.
La lettura del partecipante include anche `problemResults` e il totale, senza
aggiungere richieste HTTP. Se punteggi, squalifiche dei singoli esercizi e totale
coincidono, il lavoro registra **Risultati già corrispondenti** senza mutation.
Dopo un invio riuscito (o questa verifica di uguaglianza) la riga conserva uno
storico `olimanager.resultsSnapshot`, vincolato a endpoint, gara e partecipante.
Un cambiamento solo locale può essere inviato se il remoto coincide ancora con
lo storico. Modifiche remote inattese, totali corretti a mano e primi invii con
valori remoti diversi producono **Disallineamento nei risultati da risolvere**:
nessuna scrittura remota e dettagli Olifogli/Olimanager per ogni esercizio diverso.
Non c’è ancora un comando per forzare la risoluzione del conflitto.

I vecchi collegamenti senza storico lo acquisiscono solo quando i risultati
coincidono; un remoto completamente vuoto consente il primo invio. Se uno storico
esiste e i risultati remoti vengono cancellati, la cancellazione è un conflitto.
Righe con risultati uguali sono considerate sincronizzate anche se la mutation è
stata evitata. In caso di conflitto timestamp, storico e contatori locali restano
invariati. La verifica in sola lettura dell’anagrafica non richiede i punteggi.

La mutation `bulkUpdateResults` invia una riga alla volta, con punteggi assoluti:
anche una ripetizione dopo un’interruzione sovrascrive gli stessi valori.
Dopo `BulkUpdateResultsSuccess` o la verifica di risultati già corrispondenti il worker registra
`row.olimanager.resultsUpdatedOn`, l’esito del job e l’eventuale incremento di
`sheet.nSyncedRows` nella stessa transazione MongoDB. Righe già sincronizzate
possono essere reinviate, senza incrementare nuovamente il contatore. Errori e
righe assenti non vengono marcati come sincronizzati.

L’aggiornamento degli extra fields rimane sincrono.
I precedenti resolver sincroni di creazione e invio risultati rimangono disponibili
per compatibilità; i pulsanti dell’interfaccia ora accodano i lavori.

Un amministratore può scegliere **«Verifica Olimanager in background»** oppure la creazione/abbinamento sulle
righe selezionate di un foglio o sui fogli selezionati della raccolta. Sono
accettati solo fogli finalizzati (`locked`); la sola chiusura non basta. L’icona **Operazioni in background** nella barra superiore è disponibile agli
amministratori su tutte le pagine e apre gli ultimi 20 lavori, per tutti i fogli.
Il server WebSocket osserva `olimanager_jobs` con MongoDB Change Streams e invia
agli amministratori una notifica quando cambiano stato o conteggi (ignora i
rinnovi della lease). Riepilogo e dettagli si aggiornano automaticamente;
le notifiche ravvicinate vengono raggruppate entro 500 ms. Un punto blu sull’icona
segnala aggiornamenti mentre il pannello è chiuso. Alla riconnessione vengono
ricaricati i dati per recuperare gli aggiornamenti persi. **Aggiorna stato** resta
disponibile anche in assenza di notifiche. Il pannello si chiude con la croce o Esc.
Dopo modifiche allo schema delle subscription occorre riavviare anche il server WebSocket.

Per una prova in sviluppo:

1. Accedere come amministratore con scope OAuth `api` e permessi sulla gara
   Olimanager. Lasciare spento il worker e accodare una verifica sui fogli
   finalizzati: il lavoro resta in attesa.
2. Avviare `npm run olifogli:worker -- --once`: elabora al massimo un job ed esce.
3. Premere **Aggiorna stato** per vedere conteggi ed esiti delle singole righe.

Per lasciarlo in attesa di nuovi lavori:

```sh
npm run olifogli:worker
```

Il worker carica la configurazione `.env*` come Next.js, rispettando le variabili
esportate e `NODE_ENV`, e usa la stessa `MONGODB_URI` dell'applicazione. Occorrono
anche lo stesso `NEXTAUTH_SECRET` e `REDIS_URL` del server. Per i lavori Olimanager
serve inoltre `OLIMANAGER_GRAPHQL_ENDPOINT`. Servono transazioni MongoDB
(replica set, già previsto dal Compose).
In produzione l'immagine include `olifogli-worker.js`; entrambi gli esempi
Compose prevedono il servizio separato `olifogli-worker` con riavvio automatico.
Per aggiornare un Compose esistente, rinominare anche il vecchio servizio
`olimanager-worker` e rimuovere il relativo container con `docker compose up -d --remove-orphans`.

I job sono salvati in `olimanager_jobs`, con `rowIds` e `sheetIds` indipendenti:
entrambi possono essere popolati; il lavoro riguarda la loro unione.
La preparazione registra la selezione in `olimanager_job_items`, con un indice
univoco `(jobId, rowId)`. Dopo la preparazione non viene più ricalcolata.
I job attraversano `queued`, `preparing`, `running` e terminano in `completed`,
`completed_with_errors` o `failed`. Ogni item conserva stato, tentativi, esito,
campi anagrafici diversi ed eventuale errore.
Gli errori dei lavori restano negli item; non sovrascrivono
`row.olimanager.error`, che riguarda i trasferimenti effettivi.

I fogli vengono riservati al job nell'accodamento e non possono essere sbloccati o riaperti
né inclusi in un altro job attivo fino alla conclusione. In questa prima versione
si assume che gli amministratori non modifichino o cancellino i dati nel frattempo.
La verifica richiede finalizzazione, schema e configurazione di gara e scuola.
Le righe criptate sono segnalate come non verificabili. I vecchi job privi della
modalità remota mantengono la precedente verifica locale.

Il token OAuth viene delegato al singolo job, cifrato con `NEXTAUTH_SECRET` e
vincolato a utente, job ed endpoint. La collezione privata
`olimanager_job_credentials` non è esposta via GraphQL; le credenziali sono
eliminate alla conclusione o alla scadenza. Se il token scade o viene rifiutato,
il job passa a `needs_login` mantenendo i fogli riservati. Lo stesso amministratore
può rifare il login con scope `api` e premere **Riprendi con la sessione attuale**:
il worker prosegue dalle sole righe ancora da verificare.

Il worker acquisisce una lease di 60 secondi e salva i progressi in transazioni
dopo ogni riga remota (blocchi di 200 per i vecchi controlli locali). Le richieste
remote sono seriali, distanziate di almeno 250 ms e hanno timeout di 15 secondi.
Dopo un arresto un altro worker può riprendere il job
alla scadenza della lease; un arresto regolare la rende subito disponibile.
Non vengono rieseguiti gli item già completati. Gli indici vengono creati
idempotentemente all'accodamento e all'avvio del worker.

Per provare la creazione su staging, accedere con scope `api`, finalizzare il foglio,
selezionare una riga valida non collegata e usare **Crea/abbina partecipanti in
background**. Riavviare il worker dopo l’aggiornamento del codice; riavviare anche
il server WebSocket per caricare lo schema aggiornato. Il pannello globale mostra
il nuovo `participantId`; le righe aperte si aggiornano insieme alle notifiche dei
lavori. Si può poi lanciare una verifica sul collegamento appena creato.
La scuola deve essere iscritta all’edizione e, per gare non scolastiche, deve
esistere una sede compatibile su Olimanager.

L’invocazione remota e la transazione locale non sono atomiche tra loro. Se il worker
si interrompe dopo la risposta remota ma prima del salvataggio locale, una ripresa
può richiamare `matchOrCreateParticipant`, che cerca il partecipante già creato.
Gli item completati non vengono ripetuti; gli errori di rete o di risposta vengono
segnalati senza retry automatico della riga. Verificare l’esito remoto prima di
accodare nuovamente una riga fallita.

Per provare l’invio risultati su staging, riavviare il worker dopo l’aggiornamento,
accedere con scope `api` e scegliere una riga valida, finalizzata e già collegata.
Usare **Invia risultati in background (Olimanager)** e controllare **Risultati inviati**
nel pannello. Confrontare il totale del partecipante su staging e la data di
sincronizzazione locale. I dettagli, le righe e i conteggi dei fogli aperti vengono
ricaricati dalle notifiche dei lavori. Un token scaduto usa lo stesso percorso
`needs_login` e **Riprendi con la sessione attuale** delle altre operazioni.

Il confronto dei risultati non è un controllo di versione atomico sul provider:
una modifica remota tra la lettura e la mutation può ancora essere sovrascritta.
Per eliminare questa finestra occorre supporto di versione/compare-and-set nell’API
Olimanager. Non vengono eseguite letture aggiuntive dopo l’invio.

### Crittografia e decrittazione dei fogli tramite worker

I pulsanti **Cripta in background** e **Decripta in background** accodano lavori
`crypt_sheets` e `decrypt_sheets` allo stesso worker avviato con
`npm run olifogli:worker`. Lo stato e gli esiti per riga sono
visibili nelle **Operazioni in background**. Non richiede OAuth, un endpoint
Olimanager o la finalizzazione dei fogli.

App e worker devono avere `REDIS_URL` e lo stesso `NEXTAUTH_SECRET`. Per cifrare,
l'app deriva la chiave PBKDF2 in memoria e la consegna al worker tramite Redis
**Pub/Sub**, in una busta cifrata e autenticata con il segreto del server. Per
decriptare, consegna la password con lo stesso canale temporaneo protetto: il
worker deriva in memoria una chiave per ogni salt presente nelle righe, anche
quando provengono da cifrature effettuate in momenti diversi. Password, chiavi e
buste non vengono salvate in MongoDB, in chiavi Redis o nei log. I segreti sono
eliminati dalla memoria del worker al termine del lavoro. Il formato dei dati
cifrati resta compatibile con i dati preesistenti.

Le righe già cifrate vengono ignorate da Cripta; quelle già in chiaro vengono
ignorate da Decripta. Password errata o dati cifrati danneggiati producono un
esito di errore per riga: il contenuto cifrato resta intatto. Il ripristino dei
campi e la rimozione di `encrypted_data` avvengono nella stessa transazione.

Il worker deve essere attivo quando si preme il pulsante: se non conferma la
ricezione della chiave, la richiesta fallisce e libera i fogli. Se la chiave va
persa per un arresto del worker, il lavoro viene segnato come fallito alla scadenza
della disponibilità della chiave (entro circa un minuto dalla ripresa del worker).
Avviare di nuovo **Cripta** o **Decripta** con la stessa password: le righe già
elaborate vengono saltate. I fogli restano riservati al lavoro fino al completamento o all'errore.
Dopo l'aggiornamento, riavviare sia l'app sia il worker.
