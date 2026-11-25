# Olifogli

Olifogli è un'applicazione web con cui i docenti delle scuole partecipanti
inseriscono i risultati delle gare di matematica. È costruita con Next.js,
GraphQL e MongoDB.

Docenti e amministratori accedono con le credenziali di Olimanager
(https://olimpiadi-scientifiche.it) tramite OAuth2. I dati sono organizzati in
raccoglitori (workbook), fogli e righe, con permessi assegnati per foglio.

## Documentazione

| Documento | Contenuto |
|---|---|
| [docs/architettura.md](docs/architettura.md) | Struttura del codice, dati, permessi, GraphQL e aggiornamenti in tempo reale |
| [docs/olimanager.md](docs/olimanager.md) | Login OAuth, creazione dei fogli Archimede, dati di prova su staging |
| [docs/worker.md](docs/worker.md) | Worker dei lavori in background: verifiche, trasferimenti, crittografia |
| [docs/omr.md](docs/omr.md) | Scansioni OMR e generazione dei fogli con i worker di archiomr |
| [docs/piano-gara-distrettuale.md](docs/piano-gara-distrettuale.md) | Analisi e scelte per fogli e partecipanti della gara distrettuale da Olimanager |
| [docs/deploy.md](docs/deploy.md) | Produzione: Compose, variabili d'ambiente, aggiornamenti, log |
| [tests/README.md](tests/README.md) | Test automatici |
| [AGENTS.md](AGENTS.md) | Indicazioni sintetiche per gli agenti AI (in inglese) |

## Avvio locale

### Configurazione

Salva la configurazione locale nel file `.env` e adatta questi valori:

```
MONGODB_URI=mongodb://127.0.0.1:27017/olifogli?directConnection=true
REDIS_URL=redis://127.0.0.1:6379
NEXTAUTH_SECRET=<stringa_casuale>
NEXTAUTH_URL=http://localhost:3000
OLIMANAGER_OAUTH_CLIENT_ID=...
OLIMANAGER_OAUTH_CLIENT_SECRET=...
OLIMANAGER_URL=https://staging.olimpiadi-scientifiche.it
OLIMANAGER_GRAPHQL_ENDPOINT=https://staging.olimpiadi-scientifiche.it/graphql/
ADMIN_EMAILS=miaemail@esempio.it
SCANS_SPOOL_DIR=<directory_spool_del_worker_OMR>
SCANS_DATA_DIR=<directory_dati_del_worker_OMR>
SHEETGENSPOOL_DIR=<directory_spool_del_generatore_di_fogli>
SHEETGENDATA_DIR=<directory_pdf_del_generatore_di_fogli>
```

Le ultime quattro directory sono condivise con i worker di archiomr, che leggono
le scansioni e generano i fogli; come avviarli in locale è descritto in
[docs/omr.md](docs/omr.md#sviluppo-locale).

Le credenziali OAuth si ottengono con lo script descritto in
[docs/olimanager.md](docs/olimanager.md#applicazione-oauth). L'elenco completo
delle variabili è in [docs/deploy.md](docs/deploy.md#variabili-dambiente).

### Processi

Servono quattro processi: MongoDB (porta 27017), Redis (porta 6379),
Next.js (porta 3000) e il server WebSocket (porta 4001). Un quinto, il worker,
serve solo per i lavori in background. `npm run dev:all` avvia Next.js, server
WebSocket e worker insieme; `npm run dev` avvia soltanto Next.js.

1. Con Docker e Docker Compose installati, avvia MongoDB e Redis dalla radice
   del repository usando il file `docker-compose.yml` di esempio:

   ```bash
   docker compose up -d --wait db redis
   docker compose exec redis redis-cli ping
   ```

   Redis deve rispondere `PONG`. Il Compose configura MongoDB come replica
   set, necessario per le transazioni e per i change stream del server
   WebSocket, e conserva i dati nella directory `database/`. Entrambi i servizi
   sono esposti solo sull'interfaccia locale e richiedono le porte 27017 e 6379
   libere. Puoi usare MongoDB e Redis già installati configurando `MONGODB_URI`
   e `REDIS_URL`; MongoDB deve comunque essere un replica set.

2. Installa le dipendenze al primo avvio o dopo un aggiornamento del lockfile.
   Serve Node.js 24 LTS (con nvm: `nvm install` e `nvm use`, che leggono `.nvmrc`):

   ```bash
   npm ci
   ```

3. Avvia Next.js, server WebSocket e worker in un solo terminale:

   ```bash
   npm run dev:all              # oppure: npm run dev:all -- --no-worker
   ```

   Lo script `scripts/dev.sh` antepone a ogni riga il nome del processo
   (`[next]`, `[ws]`, `[worker]`) e, con Ctrl-C o se uno dei processi termina,
   li ferma tutti. In alternativa si possono avviare separatamente, come nei
   passi seguenti.

   Per avviare solo Next.js:

   ```bash
   npm run dev
   ```

4. Avvia il server WebSocket in un secondo terminale e lascia aperti entrambi:

   ```bash
   npm run ws-server:watch
   ```

   `ws-server:watch` riavvia il server quando cambiano i file; `npm run ws-server`
   lo avvia senza riavvio automatico. Entrambi terminano prima l'eventuale
   processo sulla porta 4001. Il server legge `.env` senza sovrascrivere le
   variabili già presenti nell'ambiente e si ferma con un errore se manca
   `NEXTAUTH_SECRET`.

5. Facoltativo: avvia il worker in un terzo terminale per elaborare i lavori in
   background (vedi [docs/worker.md](docs/worker.md)):

   ```bash
   npm run olifogli:worker
   ```

6. Apri [http://localhost:3000](http://localhost:3000) ed effettua il login.
   Usa `localhost` anche nell'URL del browser: il client locale si collega a
   `ws://localhost:4001/graphql`. Se Next.js usa un'altra porta, adegua
   `NEXTAUTH_URL` e l'URI di callback OAuth; il WebSocket resta sulla porta 4001.

### Quando riavviare

- **Server WebSocket**: dopo modifiche al suo codice, a `schema.gql` o ai
  resolver delle subscription. Non serve riavviarlo dopo la revoca di un
  permesso: le subscription aperte la applicano entro 30 secondi
  (vedi [docs/architettura.md](docs/architettura.md#permessi-sulle-subscription)).
- **Worker**: dopo modifiche al codice dei lavori in background.
- **Next.js** in modalità `dev` si aggiorna da solo.

### Problemi frequenti

**`Socket closed` o avviso sugli aggiornamenti in tempo reale.** Controlla il
terminale del server WebSocket: deve mostrare una riga con l'evento
`ws.started` senza errori successivi di MongoDB o Redis. Verifica che il login sia valido e che
Next.js e server WebSocket abbiano gli stessi `NEXTAUTH_SECRET` e `NEXTAUTH_URL`.

**Errori di login OAuth.** Vedi [docs/olimanager.md](docs/olimanager.md#login-oauth).

## Comandi utili

```bash
npm test             # test automatici (non servono MongoDB né Redis)
npm run lint         # ESLint
npm run build        # build di produzione
npm run codegen      # rigenera app/graphql/generated.ts dopo modifiche allo schema o alle query
npm run migrate:status
npm run migrate:up   # applica le migrazioni del database (migrate-mongo)
```

## Rami, CI e staging

La CI ([.github/workflows/docker-image.yml](.github/workflows/docker-image.yml))
parte a ogni push su uno di questi tre rami:

| Ramo | Cosa fa la CI |
|---|---|
| `develop` | Solo test, lint e audit delle dipendenze: niente immagine, niente deploy |
| `staging` | Test, immagine `paolini/olifogli:staging` e deploy sul server di staging |
| `main` | Test e immagini `:main`, `:latest` e `:<versione di package.json>`, ritaggando l'immagine di staging se il commit è lo stesso; il deploy in produzione è manuale ([docs/deploy.md](docs/deploy.md#aggiornamento-dellapplicazione)) |

Il repository archiomr, che contiene i worker `oliscan` e `olisheet`, segue le
stesse convenzioni (vedi [docs/omr.md](docs/omr.md)).

Si lavora su `develop`. Il ramo `staging` non serve per sviluppare: indica solo
quale commit gira sul server di staging, e lo si sposta con un push.

La forma generale è `git push origin <sorgente>:<destinazione>`: sposta il ramo
`<destinazione>` su GitHub sullo stesso commit del ramo locale `<sorgente>`,
senza merge e senza cambiare ramo sul proprio computer
(`git push origin develop` è l'abbreviazione di `develop:develop`).

| Per… | Comando |
|---|---|
| salvare il lavoro su GitHub (solo test) | `git push origin develop` |
| mettere sullo staging l'ultimo `develop` | `git push origin develop:staging` |
| provare sullo staging un branch non ancora in `develop` | `git push -f origin mio-branch:staging` |
| riportare lo staging su `develop` dopo una prova | `git push -f origin develop:staging` |

Prima di `develop:staging` fai `git push origin develop`, così lo staging riceve
un commit già presente anche su `develop`.

`-f` (force) serve quando lo spostamento toglie dei commit dal ramo remoto,
per esempio passando da `develop` a un branch di prova e ritorno: senza, git
rifiuta il push. Su `staging` è sicuro, perché i commit restano negli altri
rami. **Non usare mai `-f` su `develop` o `main`**, dove cancellerebbe lavoro.

Un push su `staging` mentre la build precedente è ancora in corso la annulla e
mette sullo staging solo l'ultimo commit. Il deploy esegue sul server lo script
`deploy.sh`, che scarica le immagini e riavvia app, `ws-server`, worker,
`oliscan` e `olisheet`. Le migrazioni del database le applica il servizio
`migrate`, che Compose avvia prima di app, `ws-server` e worker se il file
Compose del server lo prevede (vedi
[docs/deploy.md](docs/deploy.md#migrazioni-del-database)); altrimenti le
applica ogni istanza all'avvio.

Le versioni si segnano con un tag annotato, per esempio
`git tag -a v1.10.0 -m "Olifogli 1.10.0"` seguito da `git push origin v1.10.0`.
I tag non avviano la CI: il numero di versione delle immagini viene da
`package.json`.

