## Architettura del Sistema

### Struttura del Progetto

```
olifogli/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── auth/                # NextAuth configuration
│   │   └── upload/              # File upload endpoint
│   ├── components/              # React Components
│   ├── graphql/                 # GraphQL Schema e Resolvers
│   ├── lib/                     # Utilities e Models
│   └── [routes]/                # Pages dinamiche
├── migrations/                  # Database migrations
└── types/                       # TypeScript definitions
```

### Database Schema (MongoDB)

#### Collections Principali

**users**
```typescript
{
  _id: ObjectId
  name: string
  email: string
  isAdmin?: boolean
  createdAt: Date
  lastLogin: Date
}
```

**workbooks**
```typescript
{
  _id: ObjectId
  name: string
  ownerId: ObjectId
  commonData: Record<string, string>  // Dati flessibili key-value
  createdOn: Date
  updatedOn: Date
  createdBy: string  // Email dell'utente
  updatedBy: string  // Email dell'utente
}
```

**sheets**
```typescript
{
  _id: ObjectId
  createdAt: Date
  permissions: Permission[]  // Sistema di autorizzazioni strutturato
  closed?: boolean           // Foglio chiuso, non modificabile
  closedBy?: string          // Email di chi ha chiuso il foglio
  closedOn?: Date            // Quando è stato chiuso
  locked?: boolean           // Foglio bloccato (solo admin sistema)
  lockedBy?: string          // Email di chi ha bloccato il foglio
  lockedOn?: Date            // Quando è stato bloccato
}
```

**rows**
```typescript
{
  _id: ObjectId
  sheetId: ObjectId
  error: string // '' se è valido
  data: Record<string, string>  // Dati flessibili key-value
  createdOn: Date
  createdBy: string  // Email dell'utente
  updatedOn: Date
  updatedBy: string  // Email dell'utente
}
```

**scan_jobs**
```typescript
{
  _id: ObjectId
  sheetId: ObjectId
  ownerId: ObjectId
  timestamp: Date
  messages: ScanMessage[]      // Log del processing
}
```

**scan_results**
```typescript
{
  _id: ObjectId
  jobId: ObjectId
  image: string               // Nome file immagine
  rawData: Record<string, string>
}
```

### GraphQL API

#### Schema Types
- `Workbook`: Container per fogli
- `Sheet`: Singolo foglio con schema definito
- `Row`: Riga di dati in un foglio
- `User`: Utente del sistema
- `ScanJob`: Job di acquisizione OMR
- `ScanResults`: Risultati dell'acquisizione
- `Report`: Report aggregato con classifica e distribuzione punteggi
- `ReportEntry`: Singola entry nella classifica con dati studente e punteggio
- `ScoreDistribution`: Distribuzione dei punteggi per grafico
- `UserCursor`: Posizione cursore di un utente `{ email, lineKey, fieldName, tabId }`

#### Queries Principali
- `workbooks`: Lista workbook utente
- `sheets(workbookId)`: Fogli in un workbook
- `rows(sheetId)`: Righe in un foglio
- `cursors(sheetId)`: Cursori attivi sul foglio (da Redis hash, per stato iniziale)
- `scanJobs(sheetId)`: Job di scansione per un foglio
- `workbookReports(workbookId)`: Report aggregati per workbook (archimede_biennio e archimede_triennio)

#### Mutations Principali
- `addWorkbook(name)`: Crea nuovo workbook
- `updateWorkbook(_id, name, commonData)`: Aggiorna workbook (solo owner o admin)
- `deleteWorkbook(_id)`: Elimina workbook (solo se vuoto)
- `addSheet(...)`: Crea nuovo foglio
- `updateSheet(_id, ...)`: Aggiorna foglio
- `addRow(sheetId, data)`: Aggiunge riga
- `addRows(sheetId, columns, rows)`: Import bulk CSV
- `patchRow(_id, data)`: Modifica riga
- `deleteRow(_id)`: Cancella riga (pubblica `rowsDeleted` e `workbookUpdated`)
- `deleteRows(ids)`: Cancella righe bulk (pubblica `rowsDeleted` per sheet e `workbookUpdated` per workbook)
- `toggleSelection(_id)`: Seleziona/deseleziona riga
- `closeSheet(_id)`: Chiude un foglio (solo admin del foglio)
- `openSheet(_id)`: Riapre un foglio (solo admin del foglio)
- `lockSheet(_id)`: Blocca un foglio (solo admin di sistema)
- `unlockSheet(_id)`: Sblocca un foglio (solo admin di sistema)
- `moveCursor(sheetId, lineKey, fieldName, tabId)`: Pubblica la posizione cursore e aggiorna hash Redis `ACTIVE_CURSORS.<sheetId>`

#### Subscriptions
- `rowChanged(sheetId)`: Notifica in tempo reale quando una riga viene modificata o aggiunta
- `rowsDeleted(sheetId)`: Array di ObjectId delle righe cancellate
- `cursorChanged(sheetId)`: Notifica la posizione cursore degli altri utenti connessi allo stesso foglio
- `workbookUpdated(workbookId)`: Segnala che qualcosa nel workbook è cambiato; filtrato via `withFilter` per mostrare solo eventi da fogli a cui l'utente ha accesso

## Gestione Stato dei Fogli

### Stati dei Fogli
I fogli possono trovarsi in tre stati:
1. **Aperto e Sbloccato** (default): Modificabile da tutti gli utenti autorizzati
2. **Chiuso**: Non modificabile, ma configurabile dagli admin del foglio
3. **Bloccato**: Non modificabile, configurabile solo dagli admin di sistema

### Controlli di Accesso per Stato

#### Foglio Aperto (closed=false, locked=false)
- Gli utenti con permesso `editor` o 'admin' superiore possono modificare le righe
- Gli utenti con permesso `admin` o owner possono modificare i metadati
- Gli utenti con permesso `view` possono solo visualizzare i dati
- Gli admin del foglio possono chiudere il foglio

#### Foglio Chiuso (closed=true, locked=false)
- Nessuno può modificare le righe (inclusi admin del foglio)
- Gli admin del foglio possono ancora modificare permessi e commonData
- Gli admin del foglio possono riaprire il foglio
- Gli admin di sistema possono bloccare il foglio

#### Foglio Bloccato (locked=true)
- Solo gli admin di sistema possono modificare qualsiasi cosa
- Gli admin del foglio non possono modificare nulla
- Solo gli admin di sistema possono sbloccare il foglio

### Workflow Tipico
1. Durante la raccolta dati: foglio aperto
2. Al termine della raccolta: admin del foglio chiude il foglio
3. Per archiviazione permanente: admin di sistema blocca il foglio

## Sistema di Autenticazione

### OAuth2 Integration
- **Provider**: Olimanager (sistema delle Olimpiadi Scientifiche)
- **Flow**: Authorization Code with PKCE
- **Scopes**: `openid email profile`

### Session Management
- **JWT Tokens**: Firmati con `NEXTAUTH_SECRET`
- **User Session**: Persistente con NextAuth
- **Admin Rights**: Basato su `ADMIN_EMAILS` environment variable

### Security Features
- Structured permissions system per sheet with roles (admin/editor/view)
- Owner-based permissions
- Admin override capabilities (`isAdmin` flag su utente)
- Supervisor override (`isSupervisor` flag): accesso in lettura a tutti i fogli
- `isAdmin`/`isSupervisor` caricati una volta per connessione WS e cached in `ConnectionState`
- Subscription `workbookUpdated` filtrata da `withFilter`: solo eventi per fogli accessibili all'utente

## Sistema di Processing OMR

Il sistema di processing OMR è stato spostato nel progetto separato **archiomr** che gestisce:
- Worker Python con OMRChecker per elaborazione PDF
- Worker Python per generazione fogli personalizzati
- Template per diversi tipi di questionari

### Integrazione con Olifogli
Olifogli si integra con archiomr tramite:
- **Directory condivise**: `spool/` e `data/` per scambio file
- **MongoDB condiviso**: Database comune per coordinamento
- **Collections**: `scan_jobs` e `scan_results` per tracking elaborazioni

Per dettagli sul sistema OMR e generazione fogli, consultare la documentazione del progetto **archiomr**.

## Real-time (WebSocket)

### Architettura
Il sistema real-time si basa su **due processi Node separati** che comunicano tramite Redis:

```
Browser ──HTTP──► Next.js (port 3000)  ──publish──► Redis
Browser ──WS───► ws-server (port 4001) ◄─subscribe── Redis
```

- **Next.js** gestisce le mutation GraphQL via HTTP (es. `moveCursor`, `patchRow`)
- **ws-server** (`ws-server.ts`) gestisce le subscription GraphQL via WebSocket
- **Redis** è il broker pub/sub che disaccoppia i due processi

Questo design è necessario perché Next.js in produzione può girare su più istanze (`app1`, `app2`, `app3`) dietro nginx: Redis garantisce che le notifiche raggiungano tutti i client connessi indipendentemente da quale istanza ha processato la mutation.

### WebSocket Server (`ws-server.ts`)
- Porta: `WS_SERVER_PORT` (default `4001`)
- Libreria: `graphql-ws` v6 con `useServer` da `graphql-ws/use/ws`
- Carica lo stesso `schema.gql` e `resolvers.ts` del Next.js app
- Espone anche un endpoint HTTP GraphQL su `/graphql` (stesso path)
- Autenticazione opzionale via JWT in `connectionParams.sessionToken`
- Avvio: `npm run ws-server` (script: `fuser -k 4001/tcp; tsx watch ws-server.ts`)
- **Contesto per subscriber**: alla prima subscription di ogni connessione, il ws-server recupera da MongoDB `isAdmin` e `isSupervisor` dell'utente e li caches in memoria per la durata della connessione

### Redis PubSub (`app/lib/pubsub.ts`)
- Libreria: `graphql-redis-subscriptions` (`RedisPubSub`)
- Usa due connessioni ioredis (publish + subscribe)
- URL: variabile d'ambiente `REDIS_URL` (default `redis://127.0.0.1:6379`)
- Topics:
  - `ROW_CHANGED.<sheetId>` — riga aggiunta/modificata/cancellata
  - `ROWS_DELETED.<sheetId>` — una o più righe cancellate (payload: array di ObjectId)
  - `SHEET_UPDATED.<sheetId>` — metadati foglio aggiornati
  - `CURSOR_CHANGED.<sheetId>` — posizione cursore utente
  - `WORKBOOK_UPDATED.<workbookId>` — qualcosa nel workbook è cambiato (contatori, righe, fogli)

### Redis KV (`app/lib/redis.ts`)
- Client ioredis separato per operazioni chiave-valore (non pubsub)
- Usato per mantenere lo stato attuale dei cursori per sheet: `ACTIVE_CURSORS.<sheetId>` (hash Redis: `tabId → JSON cursor`)
- Aggiornato da `moveCursor` mutation; ripulito dal disconnect handler del ws-server

### Cursor Presence (Presenza Cursore Collaborativa)
Permette agli utenti che guardano lo stesso foglio di vedere la posizione del cursore degli altri in tempo reale.

**Flusso (aggiornamento live):**
1. L'utente sposta il cursore su una cella → `Table.tsx` invia `moveCursor` mutation (debounced 300ms)
2. Il resolver pubblica `{ email, lineKey, fieldName, tabId }` su Redis topic `CURSOR_CHANGED.<sheetId>`
3. Il resolver salva il cursore in `ACTIVE_CURSORS.<sheetId>` (hash Redis, chiave `tabId`); se `lineKey` è null lo rimuove
4. Il ws-server riceve da Redis e invia `cursorChanged` a tutti i subscriber del foglio
5. `Sheet.tsx` riceve l'evento, filtra il proprio cursore (via `tabId`) e aggiorna `otherCursors` state
6. `TableRow.tsx` riceve `cursorUsers` e applica `box-shadow: inset` colorato sulla cella attiva

**Stato iniziale (nuovi visitatori):**
- Al montaggio di `Sheet.tsx` viene eseguita la query `cursors(sheetId)` che legge l'hash `ACTIVE_CURSORS.<sheetId>` da Redis
- I cursori già presenti vengono mostrati immediatamente, senza aspettare movimenti

**Disconnessione:**
- L'`onDisconnect` del ws-server esegue `redis.hdel(ACTIVE_CURSORS.<sheetId>, tabId)` e pubblica un evento `cursorChanged` con `lineKey: null, fieldName: null` per rimuovere il cursore dai client connessi

**Identificazione tab:** ogni tab browser genera un `tabId` univoco (`crypto.randomUUID()`) al montaggio, **solo in memoria** (non persistito in sessionStorage, per evitare che tab duplicate ereditino lo stesso ID). Questo consente di mostrare cursori anche tra tab dello stesso utente.

**Colore cursore:** derivato dall'hash dell'email con funzione `emailToColor` → `hsl(hash % 360, 70%, 45%)`. Ogni utente ha sempre lo stesso colore.

### Cancellazione Righe Real-time
Quando una riga viene cancellata (`deleteRow` / `deleteRows`), il foglio si aggiorna in tempo reale:
- `deleteRow`: pubblica `ROWS_DELETED.<sheetId>` con `[_id]`
- `deleteRows`: raggruppa gli ID per sheetId e pubblica un singolo `ROWS_DELETED` per sheet (es. 100 righe → 1 publish per sheet, non 100)
- `Sheet.tsx` si iscrive a `rowsDeleted` e, all'evento:
  - se ≤ 20 ID: rimuove direttamente dalla cache Apollo (`client.cache.updateQuery`)
  - se > 20 ID: esegue `refetch()` per efficienza

### Workbook Real-time (`workbookUpdated`)
Le pagine workbook (distribuzione, classifica, selezione, ecc.) si aggiornano in tempo reale senza polling.

**Flusso:**
1. Una mutation che modifica dati del workbook (`addRow`, `patchRow`, `toggleSelection`, `deleteRow`, `deleteRows`, `updateSheet`) pubblica `WORKBOOK_UPDATED.<workbookId>` su Redis, con `_allowedEmails: sheet.permissions[].email` nel payload
2. Il ws-server riceve l'evento e applica `withFilter` prima di inviarlo al subscriber:
   - utenti `isAdmin` o `isSupervisor` ricevono sempre l'evento
   - altri utenti ricevono l'evento solo se la propria email è in `_allowedEmails`
3. I componenti workbook (`WorkbookSheets`, `WorkbookDistribution`, `WorkbookRanking`, ecc.) usano l'hook condiviso `useWorkbookUpdated(workbookId, callback, delay=500ms)` che chiama `refetch()` con un debounce di 500ms per assorbire burst di eventi (es. import bulk)

**Sicurezza:** gli utenti non-admin vedono solo eventi per fogli di cui hanno esplicitamente il permesso, grazie al `withFilter` sul resolver della subscription.

### ⚠️ Gap in Produzione
Il `docker-compose-production.yml` attuale **non include** il servizio `ws-server` né il servizio `redis`. Per abilitare le feature real-time in produzione è necessario aggiungere:
```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  networks: [backend]

ws-server:
  image: paolini/olifogli:latest
  command: ["node", "-e", "require('./ws-server.js')"]
  environment:
    <<: *common-env
    REDIS_URL: "redis://redis:6379"
    WS_SERVER_PORT: "4001"
  networks: [backend]
```
E aggiungere `REDIS_URL: redis://redis:6379` alle app instances.



### Layout e Navigation
- **RootLayout**: Setup globale con SessionProvider
- **NavBar**: Navigazione principale
- **Page**: Component wrapper per layout consistente

### Data Management
- **ApolloProviderClient**: GraphQL client setup
- **Loading/Error**: Stati di caricamento uniformi
- **Table/TableInner**: Componenti per visualizzazione dati

### Import e Export
- **CsvImport**: Import batch da file CSV
- **ScansImport**: Upload e processing PDF per OMR
- **SchoolSheetsCreation**: Creazione automatica fogli scuole

### User Interface
- **Button/Input**: Componenti UI base
- **UserProfile**: Gestione profilo utente
- **Workbooks/Sheets**: Gestione contenuti
- **WorkbookConfigure**: Configurazione workbook (campi chiave-valore, eliminazione)
- **WorkbookReport**: Visualizzazione report aggregati workbook

### Reporting e Analisi
- **WorkbookReport**: Component per visualizzazione report workbook
  - Supporta report separati per archimede_biennio e archimede_triennio
  - Tab "Risultati": Classifica degli studenti per punteggio
  - Tab "Distribuzione": Grafico a barre della distribuzione dei punteggi
  - Tab "Configurazione": Gestione campi chiave-valore del workbook e configurazioni
  - Rispetta i permessi utente: mostra solo dati da fogli accessibili
  - Visualizza nome foglio, cognome, nome, classe, sezione e punteggio

## Schema e Validazione

### Schema Types
Il sistema supporta diversi tipi di schema predefiniti:
- **Archimede**: Gare individuali
- **Distrettuale**: Gare distrettuali
- **AmmissioneSenior**: Ammissioni senior
- **Scuole**: Dati delle scuole

Ogni schema definisce:
- Campi obbligatori e opzionali
- Regole di validazione
- Template OMR associati

## Configurazione e Deployment

### Environment Variables

#### App Container
```bash
# Database
MONGODB_URI=mongodb://db:27017/olifogli

# Authentication
NEXTAUTH_SECRET=<random_string>
NEXTAUTH_URL=https://olifogli.matb.it
OLIMANAGER_OAUTH_CLIENT_ID=...
OLIMANAGER_OAUTH_CLIENT_SECRET=...
OLIMANAGER_URL=https://olimpiadi-scientifiche.it

# Admin
ADMIN_EMAILS=emanuele.paolini@unipi.it

# Redis PubSub (real-time subscriptions)
REDIS_URL=redis://127.0.0.1:6379

# ws-server
WS_SERVER_PORT=4001

# Worker Integration (directory condivise con archiomr)
SCANS_SPOOL_DIR=/app/spool
SCANS_DATA_DIR=/app/data
```

### Docker Deployment

#### Architettura Multi-Container
Il sistema di produzione utilizza **3 container separati**:

```yaml
services:
  app:                    # Applicazione Next.js
    image: paolini/olifogli:latest
    ports: ["8000:3000"]
    
  db:                     # Database MongoDB
    image: mongo:6
```

**Nota**: I worker OMR (`oliscan`) e di generazione fogli (`sheetgen`) sono gestiti nel progetto separato **archiomr**.

#### Volumi Condivisi
```bash
# Directory locali
./spool:/app/spool      # Queue file PDF per worker OMR (condivisa con archiomr)
./data:/app/data        # Risultati elaborazione (condivisa con archiomr)
./database:/data/db     # Dati MongoDB
```

#### Build e Deploy
```bash
# Build app container
VERSION=$(node -e "console.log(require('./package.json').version)")
docker build . -t paolini/olifogli:${VERSION}

# Deploy
docker-compose up -d
```

### Database Migrations
Il sistema utilizza `migrate-mongo` per le migrazioni:
```bash
npm run migrate:status    # Stato migrazioni
npm run migrate:up        # Applica migrazioni
npm run migrate:create    # Crea nuova migrazione
```

## API Endpoints

### REST Endpoints
- `POST /api/upload`: Upload file per processing
- `GET /api/auth/*`: NextAuth authentication endpoints

### GraphQL Endpoint
- `POST /app/graphql/route`: Single GraphQL endpoint

## Performance e Scalabilità

### Ottimizzazioni Frontend
- **Turbopack**: Development build ottimizzato
- **Standalone Build**: Output minimale per produzione
- **Component Lazy Loading**: Caricamento componenti on-demand

### Database Performance
- **Indexes**: Indici ottimizzati su collezioni principali
- **Connection Pooling**: Pool di connessioni MongoDB
- **Query Optimization**: Resolver GraphQL ottimizzati

### File Processing
- **Async Processing**: Worker separato per OMR
- **Batch Operations**: Import CSV ottimizzato
- **File Storage**: Separazione storage immagini

## Security Considerations

### Data Protection
- **Input Validation**: Validazione lato server
- **Authorization**: Controllo accesso per sheet
- **File Upload**: Validazione tipi e dimensioni file

### Authentication Security
- **JWT Signing**: Token firmati e verificati
- **Session Security**: HttpOnly cookies
- **OAuth Security**: PKCE flow implementation

## Monitoring e Logging

### Application Logging
Il sistema utilizza un **plugin Apollo Server** per logging automatico di tutte le richieste GraphQL.

#### GraphQL Request Logging
- **Plugin**: `graphqlLoggerPlugin` in `app/graphql/logger-plugin.ts`
- **Cosa viene loggato**:
  - Tipo operazione (Query/Mutation)
  - Nome operazione
  - User ID dell'utente autenticato
  - Durata dell'operazione (ms)
  - Stato (success/error)
  - Errori eventuali
  - Variabili (solo in development)

#### Formato Log
```
[timestamp] | TYPE | operationName | user=userId | duration | status
```

**Esempio Development:**
```
[2025-10-21T14:32:15.123Z] | QUERY | workbooks | user=507f1f77bcf86cd799439011 | 45ms | OK
[2025-10-21T14:32:16.456Z] | MUTATION | addSheet | user=507f1f77bcf86cd799439011 | 120ms | OK | vars={"name":"Gara 2025"}
[2025-10-21T14:32:17.789Z] | MUTATION | addRow | anonymous | 50ms | ERROR: Not authenticated
```

**Esempio Production:**
```
[2025-10-21T14:32:15.123Z] | QUERY | workbooks | user=507f1f77bcf86cd799439011 | 45ms | OK
[2025-10-21T14:32:16.456Z] | MUTATION | addSheet | user=507f1f77bcf86cd799439011 | 120ms | OK
```

#### Destinazione Log

**Development**: Console

**Production**: **Dual logging** - sia console che file persistenti
- **Console (Docker logs)**: Per debugging immediato
  ```bash
  docker logs olifogli-app -f
  docker logs olifogli-app 2>&1 | grep ERROR
  ```
  
- **File persistenti**: Volume `/app/logs` (sopravvive agli aggiornamenti)
  ```bash
  # Sul server: /docker/olifogli/logs/
  tail -f logs/graphql-$(date +%Y-%m-%d).log
  tail -f logs/graphql-errors-$(date +%Y-%m-%d).log
  ```

**Rotazione**: File giornalieri automatici (`graphql-YYYY-MM-DD.log`)

## Real-time updates (GraphQL Subscriptions)

Planned integration: use `ApolloServer` for HTTP queries/mutations and `graphql-ws` (`useServer`) to serve GraphQL subscriptions on a WebSocket transport, with `graphql-redis-subscriptions` (`RedisPubSub`) as the production-ready PubSub backend.

Architecture summary:
- Single executable `schema` (created with `makeExecutableSchema`) is passed to both `ApolloServer` (HTTP handler) and `useServer` (WebSocket server). This ensures queries/mutations and subscriptions use the same types and resolvers.
- `RedisPubSub` (configured with `ioredis` publisher/subscriber) is injected into resolver `context` so mutation resolvers call `pubsub.publish(ROW_CHANGED, { rowChanged: payload })` and subscription resolvers use `pubsub.asyncIterator(ROW_CHANGED)` or a per-sheet topic `ROW_CHANGED.<sheetId>`.
- `useServer` is attached to the same underlying `http.Server` as the HTTP handler (or to a dedicated server) and uses `context` / `connectionParams` for authentication when clients open WS connections.
- Client-side: `ApolloClient` uses `GraphQLWsLink` (from `graphql-ws`) for subscriptions and `HttpLink` for queries/mutations; `split` routes subscription operations to the WS link.

Implementation notes:
- Prefer topic namespaced by sheet (e.g. `ROW_CHANGED.<sheetId>`) to reduce server-side filtering and Redis message volume.
- Add `ApolloServer` plugins to gracefully drain both the HTTP server and the WebSocket server on shutdown.
- Ensure `graphql-ws` protocol version matches client (use `graphql-ws` on both client and server). For Next.js App Router, run a small custom Node process (or extend the Next server) to attach the `WebSocketServer` and `useServer` to the same `http.Server` that serves the app.
- For development, a lightweight fallback (Redis → simple WebSocket broadcaster) can be used temporarily while integrating `useServer`.

Operational checklist before enabling in production:
- Run Redis in durable configuration and verify `publisher`/`subscriber` connections and retry strategy.
- Load-test the subscription throughput (per-sheet topics preferred) and tune Redis and connection limits.
- Add authentication/authorization to subscription context (verify that subscribers have permissions to the requested `sheetId`).
- Remove or keep SSE fallback endpoints depending on deployment needs.


**Volume Docker**: 
```yaml
volumes:
  - ./logs:/app/logs
```

**Vantaggio chiave**: I log NON vengono persi quando aggiorni l'immagine e Docker ricrea il container.

#### Altri Log
- **Database Logging**: Stato processing in scan_jobs (collection MongoDB)
- **Worker Logging**: Log dei worker nel progetto **archiomr**

### Health Checks
- **MongoDB Connection**: Verifica connessione database
- **GraphQL Health**: Endpoint di health check
- **Worker Status**: Monitoring tramite scan_jobs (gestito da archiomr)

## Repository e Deployment

### Separazione dei Repository
Il sistema Olifogli è composto da **due repository separati**:

1. **olifogli** (questo repository): Applicazione Next.js principale
   - Frontend React/Next.js
   - Backend GraphQL
   - Database models e migrations
   - Dockerfile per container `paolini/olifogli`

2. **archiomr** (repository separato): Worker Python per OMR e generazione fogli
   - Worker Python con OMRChecker per elaborazione PDF
   - Worker Python per generazione fogli personalizzati LaTeX→PDF
   - Template per diversi tipi di questionari
   - Dockerfile per container `paolini/oliscan` e `paolini/sheetgen`
   - Logica di elaborazione PDF→PNG→OMR

### Deployment di Produzione
```bash
# Server: olimat
# Directory: /docker/olifogli/
# URL: https://olifogli.matb.it
# Porta: 8000 (mappata da 3000 interna)
```

## Estensibilità

### Nuovi Schema Types
1. Creare classe in `app/lib/schema/`
2. Registrare in `app/lib/schema.ts`
3. Aggiungere template OMR nel repository **archiomr**

### Nuovi Component
- Seguire pattern esistenti in `app/components/`
- Utilizzare Apollo Client per GraphQL
- Implementare loading states

### Nuovi Resolver
- Aggiungere in `app/graphql/resolvers/`
- Registrare in `app/graphql/resolvers.ts`
- Aggiornare schema GraphQL se necessario

## Troubleshooting

### Problemi Comuni
1. **MongoDB Connection**: Verificare `MONGODB_URI`
2. **OAuth Errors**: Controllare credenziali Olimanager
3. **OMR Processing**: Verificare worker Python nel progetto **archiomr**
4. **File Upload**: Controllare permessi directory condivise

### Debug Mode
```bash
# Development con debug
npm run dev
```

Questa documentazione fornisce una panoramica completa del sistema Olifogli per permettere a una AI di comprendere rapidamente la struttura e implementare modifiche o estensioni al sistema.