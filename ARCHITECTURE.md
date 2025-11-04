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

#### Queries Principali
- `workbooks`: Lista workbook utente
- `sheets(workbookId)`: Fogli in un workbook
- `rows(sheetId)`: Righe in un foglio
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
- `closeSheet(_id)`: Chiude un foglio (solo admin del foglio)
- `openSheet(_id)`: Riapre un foglio (solo admin del foglio)
- `lockSheet(_id)`: Blocca un foglio (solo admin di sistema)
- `unlockSheet(_id)`: Sblocca un foglio (solo admin di sistema)

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
- Admin override capabilities

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

## Componenti Frontend

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