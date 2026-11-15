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
esegue test, lint e audit prima di costruire e pubblicare l'immagine. Dopo la
pubblicazione occorre aggiornare **tutti** i servizi che usano l'immagine (app,
`ws-server` e `olifogli-worker`) e verificare le versioni effettive nei
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

### Cosa viene registrato

I log GraphQL (`app/graphql/logger-plugin.ts`) registrano soltanto timestamp
UTC, identificativo casuale della richiesta, tipo di operazione, nomi dei campi
radice definiti nello schema, durata, esito e codici di errore ammessi. Non
registrano nomi di operazione o alias scelti dal client, variabili, identità,
payload, messaggi di errore liberi o stack trace.

I log WebSocket contengono il tipo di evento e i codici di errore, senza payload,
`tabId` o identificativi delle operazioni forniti dal client. La diagnostica
applicativa usa identificatori statici degli eventi e categorie di errore: i
dettagli dei dati restano visibili nell'interfaccia autorizzata, non nei log.
Nel codice non usare `console.log` su richieste, risposte, configurazioni o
errori grezzi; per gli errori usare `logDiagnostic` con un evento statico.

Il logging delle URL delle richieste in sviluppo Next.js è disabilitato per non
registrare parametri OAuth.

### File di log

Se `LOG_DIR` è impostata, i log GraphQL vengono scritti anche nei file
`graphql-YYYY-MM-DD.log` e `graphql-errors-YYYY-MM-DD.log`, con rotazione
giornaliera secondo UTC e permessi `0600`. La directory deve essere accessibile
e scrivibile dall'utente del container.

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

I Compose di produzione limitano i log console dei container applicativi e del
`ws-server` a tre file da 10 MB con il driver Docker `local`. È un limite di
dimensione, **non** una scadenza di 30 giorni, e si applica ai container ricreati
con la nuova configurazione. I log di vecchi container, reverse proxy, servizi
esterni e backup richiedono una politica separata sul sistema ospitante. Gli
access log Nginx degli esempi contengono solo tempo, stato, durata e dimensione
della risposta; gli error log del proxy possono includere dettagli della
richiesta e vanno gestiti a parte.
