# Deploy in produzione

## Servizi

Il file di riferimento è [docker-compose-production.yml](../docker-compose-production.yml).
Tutti i servizi applicativi usano l'immagine `paolini/olifogli`, costruita dal
`Dockerfile` e pubblicata dalla CI.

| Servizio | Ruolo |
|---|---|
| `app1`, `app2`, `app3` | Istanze Next.js (porta interna 3000) |
| `ws-server` | Server WebSocket delle subscription GraphQL (porta interna 4001) |
| `olifogli-worker` | Worker dei lavori in background, vedi [worker.md](worker.md) |
| `redis` | Pub/Sub tra le istanze e stato dei cursori |
| `db` | MongoDB 6 in replica set `rs0` |
| `nginx` | Proxy pubblico sulla porta 8000 |
| `oliscan`, `olisheet` | Worker Python OMR e generazione fogli, dal progetto **archiomr**; vedi [omr.md](omr.md) |

Nginx ([nginx.conf](../nginx.conf)) distribuisce le richieste HTTP tra le tre
istanze e inoltra `/ws/*` al `ws-server`, togliendo il prefisso: il client si
collega a `/ws/graphql`.

[docker-compose-production-multiapp.yml](../docker-compose-production-multiapp.yml)
è una variante con gli stessi servizi applicativi. Nginx richiede il servizio
`ws-server`: senza di esso non si avvia, perché `nginx.conf` lo cita come upstream.

I comandi di gestione più comuni (aggiornamento, arresto, backup e ripristino di
MongoDB, esecuzione di script e migrazioni) sono nel commento in testa al file
Compose.

### Volumi

| Volume | Uso |
|---|---|
| `./database` | Dati MongoDB |
| `./logs` | Log GraphQL su file (`LOG_DIR`) |
| `./spool`, `./data` | Scambio di PDF e risultati con il worker OMR `oliscan` |
| `./sheetgenspool`, `./sheetgendata` | Scambio con il generatore di fogli `olisheet` |

## Variabili d'ambiente

| Variabile | Usata da | Descrizione |
|---|---|---|
| `MONGODB_URI` | app, ws-server, worker | Connessione MongoDB; deve essere un replica set |
| `REDIS_URL` | app, ws-server, worker | Connessione Redis (default `redis://127.0.0.1:6379`) |
| `NEXTAUTH_SECRET` | app, ws-server, worker | Segreto delle sessioni; deve essere identico in tutti i servizi |
| `NEXTAUTH_URL` | app, ws-server | URL pubblico dell'applicazione |
| `OLIMANAGER_URL` | app | URL di Olimanager per il login OAuth, vedi [olimanager.md](olimanager.md#login-oauth) |
| `OLIMANAGER_OAUTH_CLIENT_ID`, `OLIMANAGER_OAUTH_CLIENT_SECRET` | app | Credenziali dell'applicazione OAuth |
| `OLIMANAGER_GRAPHQL_ENDPOINT` | app, worker | Endpoint GraphQL di Olimanager |
| `ADMIN_EMAILS` | app | Email separate da virgole: all'avvio i relativi utenti ricevono `isAdmin` |
| `SCANS_SPOOL_DIR`, `SCANS_DATA_DIR` | app | Directory condivise con `oliscan`; abilitano l'importazione delle scansioni |
| `SHEETGENSPOOL_DIR` | app | Directory delle richieste di generazione per `olisheet` (default `/app/sheetgenspool`) |
| `SHEETGENDATA_DIR` | app | Directory dei PDF generati da `olisheet` (default `/app/sheetgendata`) |
| `LOG_DIR` | app | Se impostata, i log GraphQL vengono scritti anche su file |
| `LOG_RETENTION_DAYS` | `logs:cleanup` | Giorni di conservazione dei log (default 30) |
| `WS_SERVER_PORT` | ws-server | Porta del server WebSocket (default 4001) |
| `SERVER_NAME`, `SERVER_BACKGROUND_COLOR` | app | Nome e colore della barra superiore, per distinguere gli ambienti |
| `APP_INSTANCE` | app | Etichetta dell'istanza mostrata al passaggio del mouse sul nome (`app1`, `app2`, …) |
| `OLIMANAGER_PUBLIC_KEY` | app | Chiave pubblica usata solo dal vecchio endpoint `/api/auth/callback` |

`APP_INSTANCE` è letta a runtime, quindi può essere diversa per ogni container.
Una variabile `NEXT_PUBLIC_*` sarebbe invece fissata nell'immagine al momento
della build e non servirebbe a distinguere le istanze.

## Aggiornamento dell'applicazione

Si usa Node.js 24 LTS, come nell'immagine Docker, nella CI e in `.nvmrc`.

Prima di distribuire un aggiornamento:

```sh
npm ci
npm test
npm run lint
npm audit --omit=dev
npm run build
```

La CI ([.github/workflows/docker-image.yml](../.github/workflows/docker-image.yml))
esegue test, lint e audit prima di costruire e pubblicare l'immagine. Per la
produzione si usa `paolini/olifogli:main`, costruita dal ramo `main` e
pubblicata anche come `:<versione>` (utile per tornare a una versione
precedente) e come `:latest`, che è solo un sinonimo. Il ramo `staging`
produce `:staging` e aggiorna da solo il server di staging, mentre `develop`
non produce immagini (vedi [README](../README.md#rami-ci-e-staging)). I worker
`oliscan` e `olisheet` di archiomr seguono le stesse convenzioni: in produzione
`:main`, sullo staging `:staging` (vedi [omr.md](omr.md)).

Dopo la pubblicazione occorre aggiornare **tutti** i servizi che usano
l'immagine (app, `ws-server` e `olifogli-worker`, più `oliscan` e `olisheet` se
è uscita una nuova versione di archiomr) e verificare le versioni effettive nei
container:

```sh
sudo docker compose pull
sudo docker compose up -d
```

Se ci sono nuove migrazioni del database:

```sh
sudo docker compose exec app1 npx migrate-mongo status
sudo docker compose exec app1 npx migrate-mongo up
```

Dopo il deploy collaudare login OAuth, navigazione dei fogli, upload dei PDF e
ricezione degli aggiornamenti in tempo reale. I test automatici non sostituiscono
questo collaudo con MongoDB, Redis e il provider OAuth reali.

### Note sulle dipendenze

Riferimento: issue #49.

- Il lockfile include Next.js 16, React/React DOM 19.2, NextAuth 4 e Apollo
  Server 5. Il server WebSocket usa l'adattatore `@as-integrations/express5`.
- `sharp` è una dipendenza esplicita, almeno 0.35.5, per le correzioni delle
  librerie native usate nell'ottimizzazione delle immagini. Next.js 16 include
  già un PostCSS corretto: l'override usato con Next.js 15 non serve più.
- Sviluppo e build usano Turbopack, predefinito in Next.js 16. Gli accessi ai
  volumi di scansioni e PDF generati sono esclusi dal tracciamento con
  `turbopackIgnore`: quei dati devono stare nei volumi, non nell'immagine
  standalone.
- `next lint` non esiste più e la build non esegue il lint: la CI esegue
  `npm run lint` a parte. Le diagnostiche React Compiler sui pattern esistenti
  sono avvisi, limitati ai file interessati; React Compiler non è abilitato.

## Log applicativi e conservazione

I log sono divisi in due canali, con lo stesso formato: una riga JSON con
`timestamp` (UTC), `level` (`info`, `warn`, `error`), `source` (il processo:
`app1`… da `APP_INSTANCE`, `ws-server`, `worker`) ed `event`, più i campi
ammessi per quell'evento.

| | Log del server | Log applicativi |
|---|---|---|
| A cosa servono | Stato dei processi: avvio e arresto, connessioni WebSocket, errori di MongoDB, Redis o Olimanager, diagnostica | Cosa è successo nell'applicazione: richieste GraphQL, upload, cancellazioni, lavori in background |
| Dove vanno | stdout/stderr, raccolti da Docker | File `app-YYYY-MM-DD.log` in `LOG_DIR`, e in tempo reale su Redis per la pagina admin **logs** |
| Codice | `serverLog`, `logDiagnostic`, `logWebSocketEvent`, `logOlimanagerEvent` in `app/lib/logging.ts` | `appLog` in `app/lib/appLog.ts`, solo lato server |
| Conservazione | Limite di dimensione di Docker (vedi sotto) | 30 giorni con `logs:cleanup` |

Senza `LOG_DIR` (tipicamente in sviluppo) anche i log applicativi vanno su
stdout. Le richieste GraphQL non vengono più duplicate su stdout: sul log del
server arriva solo `graphql.internal_error`, con l'identificativo della richiesta,
quando una richiesta fallisce per un errore imprevisto.

### Pagina «logs» per gli amministratori

La voce **logs** del menu che si apre cliccando l'email in alto a destra apre
la pagina `/logs` (`app/components/AppLogs.tsx`), visibile solo agli amministratori. Mostra
i log applicativi, non quelli del server:

- all'apertura gli ultimi 500 eventi del giorno più recente, dal più nuovo, letti
  da `LOG_DIR`; **Carica eventi precedenti** ne aggiunge altri 500, e si può
  scegliere un giorno precedente;
- i nuovi eventi di tutti i processi compaiono in cima in tempo reale (query
  `appLogs` e subscription `appLogAdded`, entrambe riservate agli
  amministratori). Con **pausa** i nuovi eventi vengono contati e mostrati alla
  ripresa;
- per gli eventi con `userId` mostra l'email dell'utente, se esiste ancora;
- si può filtrare per livello, processo, nome dell'evento o email, e nascondere
  le richieste GraphQL.

Senza `LOG_DIR` la storia non è disponibile, ma gli eventi in tempo reale sì.
La lettura (`app/lib/appLogReader.ts`) parte dalla fine del file, quindi anche un
giorno con molti eventi si apre senza caricare tutto il file.

### Cosa viene registrato

Le richieste GraphQL (`app/graphql/logger-plugin.ts`) registrano soltanto
identificativo casuale della richiesta, tipo di operazione, nomi dei campi radice
definiti nello schema, durata, esito e codici di errore ammessi. Non registrano
nomi di operazione o alias scelti dal client, variabili, identità, payload,
messaggi di errore liberi o stack trace.

Gli eventi applicativi rilevanti registrano anche l'ID dell'utente che ha
eseguito l'operazione (`userId`), mai email, nomi o dati delle righe:

| Evento | Quando |
|---|---|
| `scan.uploaded`, `scan.deleted` | Caricamento o eliminazione di una scansione |
| `scan_sheets.requested` | Richiesta di generazione dei fogli risposta |
| `row.deleted`, `rows.deleted`, `rows.deleted_all` | Cancellazione di righe (con il numero di righe) |
| `sheet.deleted`, `sheets.deleted`, `workbook.deleted` | Cancellazione di fogli o raccoglitori |
| `worker_files.deleted` | Cancellazione dalla pagina **file** (numero di file cancellati e non cancellati) |
| `olimanager_job.queued`, `olimanager_job.finished` | Lavori in background accodati e conclusi (per i conclusi, l'utente che li ha accodati) |

I log WebSocket contengono il tipo di evento e i codici di errore, senza payload,
`tabId` o identificativi delle operazioni forniti dal client. La diagnostica
usa identificatori statici degli eventi e categorie di errore: i dettagli dei
dati restano visibili nell'interfaccia autorizzata, non nei log.

Nel codice non usare mai `console.log` su richieste, risposte, configurazioni o
errori grezzi: usare le funzioni sopra, con un nome di evento statico. Un test
(`tests/logging.test.cjs`) lo verifica su tutto `app/`.

Il logging delle URL delle richieste in sviluppo Next.js è disabilitato per non
registrare parametri OAuth.

### File di log

Se `LOG_DIR` è impostata, tutti i processi scrivono i log applicativi nello
stesso file giornaliero `app-YYYY-MM-DD.log` (data UTC, permessi `0600`). Ogni
riga è scritta con una sola operazione in modalità append, quindi le righe di
processi diversi non si mescolano su un filesystem locale; non usare un
filesystem di rete per `LOG_DIR`. La directory deve essere scrivibile
dall'utente dei container: nel Compose di produzione `app1`…`app3` e
`olifogli-worker` montano `./logs`.

I file del formato precedente (`graphql-YYYY-MM-DD.log` e
`graphql-errors-YYYY-MM-DD.log`) non vengono più prodotti, ma `logs:cleanup` li
cancella alla scadenza come i nuovi.

### Pulizia

La pulizia è un comando esplicito, senza timer nell'applicazione:

```bash
npm run logs:cleanup -- --dry-run   # anteprima, nessuna cancellazione
npm run logs:cleanup                # cancella i file scaduti
```

`LOG_RETENTION_DAYS` vale **30** per impostazione predefinita: si conservano il
giorno UTC corrente e i 29 precedenti. La scadenza dipende dalla data nel nome
del file, anche per i log del vecchio formato; copiare o modificare il file non
prolunga la conservazione. Il comando esamina solo i file regolari con i due nomi
previsti direttamente in `LOG_DIR`; ignora link simbolici, sottodirectory, backup
e nomi non validi. Directory mancante, configurazione non valida o errori di
cancellazione producono un codice di uscita diverso da zero.

Con il Compose di produzione:

```bash
# Container già avviato
docker compose -f docker-compose-production.yml exec -T app1 npm run logs:cleanup -- --dry-run

# Funziona anche con i servizi spenti: usa lo stesso volume logs
docker compose -f docker-compose-production.yml run --rm --no-deps -T app1 npm run logs:cleanup
```

Il sistema ospitante deve pianificare il comando, per esempio una volta al
giorno, adattando il percorso:

```cron
0 3 * * * cd /srv/olifogli && /usr/bin/docker compose -f docker-compose-production.yml run --rm --no-deps -T app1 npm run logs:cleanup
```

Basta un servizio applicativo per pulire il volume condiviso. La conservazione è
applicata solo quando il comando viene eseguito: monitorarne gli errori e lasciare
il cron attivo anche quando l'applicazione è ferma. Alla prima esecuzione vengono
eliminati anche i vecchi file giornalieri scaduti; i file più recenti del vecchio
formato possono ancora contenere dati personali.

### Log dei container

I Compose di produzione limitano i log console dei container applicativi, del
`ws-server` e di `olifogli-worker` a tre file da 10 MB con il driver Docker
`local`. È un limite di dimensione, **non** una scadenza di 30 giorni, e si applica ai container ricreati
con la nuova configurazione. I log di vecchi container, reverse proxy, servizi
esterni e backup richiedono una politica separata sul sistema ospitante. Gli
access log Nginx degli esempi contengono solo tempo, stato, durata e dimensione
della risposta; gli error log del proxy possono includere dettagli della
richiesta e vanno gestiti a parte.
