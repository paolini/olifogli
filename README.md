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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## integration with OMRChecker

See https://github.com/fph/archiomr/blob/main/worker.py

set SCANS_SPOOL_DIR and SCANS_DATA_DIR to enable

## OAuth2 Setup (olimanager ↔ olifogli)

olifogli authenticates against olimanager's OAuth2/OIDC provider via NextAuth, using the standard authorization code flow with PKCE. The relevant endpoints (authorize, token, userinfo, discovery) are exposed by olimanager's Django backend, not its Next.js frontend — the two are served on different origins.

**Local development:** olimanager runs as two separate services: the Next.js frontend on port 3000 and the Django backend on port 8000. Set OLIMANAGER_URL in olifogli's .env to http://localhost:8000 (not 3000). The callback/redirect URI is http://localhost:3001/api/auth/callback/olimanager.

** Production:** frontend and backend are served under the same public domain (e.g. https://olimpiadi-scientifiche.it), with routing (proxy/CDN) handling the split internally, so OLIMANAGER_URL should simply be the public domain. The callback/redirect URI is https://fogli-olimat.olimpiadi-scientifiche.it/api/auth/callback/olimanager.
OAuth2 Application configuration (both environments): a corresponding Application must exist in Django admin (/admin/oauth2_provider/application/) with:

client_type: Confidential
authorization_grant_type: Authorization code
redirect_uris: the appropriate callback URL above
algorithm: RSA with SHA-2 256 (RS256) — required whenever the openid scope is requested. If left unset, the token endpoint will fail with a 500 error (ImproperlyConfigured: This application does not support signed tokens) when trying to issue the id_token. This also requires OAUTH2_PROVIDER["OIDC_RSA_PRIVATE_KEY"] to be configured in Django settings for that environment.

⚠️ Client secret: the plaintext client_secret is displayed only once, on the confirmation screen right after creating the Application — copy it immediately into the corresponding env variable (OLIMANAGER_OAUTH_CLIENT_SECRET). If lost, the only fix is deleting and recreating the Application.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

Tested deployment with docker-compose-production.yml for a template configuration file.


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
