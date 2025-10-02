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
├── worker/                      # Python OMR Worker
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
  createdOn: Date
  updatedOn: Date
  createdBy: ObjectId
  updatedBy: ObjectId
}
```

**sheets**
```typescript
{
  _id: ObjectId
  createdAt: Date
  permissions: Permission[]  // Sistema di autorizzazioni strutturato
}
```

**rows**
```typescript
{
  _id: ObjectId
  sheetId: ObjectId
  isValid: boolean
  data: Record<string, string>  // Dati flessibili key-value
  createdOn: Date
  createdBy: ObjectId
  updatedOn: Date
  updatedBy: ObjectId
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

#### Queries Principali
- `workbooks`: Lista workbook utente
- `sheets(workbookId)`: Fogli in un workbook
- `rows(sheetId)`: Righe in un foglio
- `scanJobs(sheetId)`: Job di scansione per un foglio

#### Mutations Principali
- `addWorkbook(name)`: Crea nuovo workbook
- `addSheet(...)`: Crea nuovo foglio
- `addRow(sheetId, data)`: Aggiunge riga
- `addRows(sheetId, columns, rows)`: Import bulk CSV

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
- Structured permissions system per sheet with roles (admin/editor)
- Owner-based permissions
- Admin override capabilities

## Sistema di Processing OMR

### Worker Architecture
Il worker Python gira in un **container Docker separato** (`paolini/oliscan:latest`) e monitora continuamente la directory spool condivisa per nuovi file PDF da processare.

#### Workflow di Processing
1. **File Detection**: Monitoring della spool directory condivisa
2. **PDF Conversion**: PDF → PNG tramite pdf2image
3. **OMR Processing**: Utilizzo di OMRChecker per riconoscimento
4. **Results Storage**: Salvataggio in MongoDB + file system condiviso
5. **Status Updates**: Log real-time in scan_jobs

#### Directory Structure (Condivisa tra Containers)
```
/app/spool/          # Directory condivisa via Docker volumes
├── processing/      # File PDF in elaborazione
├── completed/       # File PDF processati con successo
├── aborted/         # File PDF con errori di processing
└── tmp/            # Directory temporanee worker

/app/data/           # Directory risultati condivisa
└── {jobId}/         # Directory per ogni job (nome = ObjectId MongoDB)
    └── *.png        # Immagini risultanti dall'elaborazione
```

#### File Naming Convention
I file PDF devono seguire il pattern: `{schema}-{jobId}.pdf`
- `schema`: Tipo di questionario (es. "archimede", "distrettuale")
- `jobId`: ObjectId del scan_job MongoDB

#### Storage dei Risultati
- **PDF Originali**: Spostati in `spool/completed/` o `spool/aborted/`
- **Immagini Elaborate**: Salvate in `data/{jobId}/` 
- **Metadati**: Memorizzati in MongoDB (`scan_results` collection)
- **Directory Names**: Corrispondono agli ObjectId MongoDB per linking diretto

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

# Worker Integration
SCANS_SPOOL_DIR=/app/spool
SCANS_DATA_DIR=/app/data
```

#### Worker Container
```bash
# Worker Configuration
SPOOL_DIR=/app/spool
DATA_DIR=/app/data
MONGO_URI=mongodb://db:27017/olifogli

# Processing Settings
CHECK_INTERVAL=10
DB_NAME=olifogli
COLLECTION_NAME=scan_jobs
RESULTS_COLLECTION_NAME=scan_results
```

### Docker Deployment

#### Architettura Multi-Container
Il sistema di produzione utilizza **3 container separati**:

```yaml
services:
  app:                    # Applicazione Next.js
    image: paolini/olifogli:latest
    ports: ["8000:3000"]
    
  worker:                 # Worker Python OMR
    image: paolini/oliscan:latest
    
  db:                     # Database MongoDB
    image: mongo:6
```

#### Volumi Condivisi
```bash
# Directory condivise tra app e worker
./spool:/app/spool      # Queue file PDF
./data:/app/data        # Risultati elaborazione
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
- **Console Logging**: Per development e debugging
- **Database Logging**: Stato processing in scan_jobs
- **Error Tracking**: Gestione errori centralizzata

### Health Checks
- **MongoDB Connection**: Verifica connessione database
- **GraphQL Health**: Endpoint di health check
- **Worker Status**: Monitoring tramite scan_jobs

## Repository e Deployment

### Separazione dei Repository
Il sistema Olifogli è composto da **due repository separati**:

1. **olifogli** (questo repository): Applicazione Next.js principale
   - Frontend React/Next.js
   - Backend GraphQL
   - Database models e migrations
   - Dockerfile per container `paolini/olifogli`

2. **oliscan** (repository separato): Worker Python OMR
   - Worker Python con OMRChecker
   - Template per diversi tipi di questionari
   - Dockerfile per container `paolini/oliscan`
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
3. Aggiungere template OMR nel repository **oliscan**

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
3. **OMR Processing**: Verificare worker Python e dipendenze
4. **File Upload**: Controllare permessi directory

### Debug Mode
```bash
# Development con debug
npm run dev

# Worker con logging verbose
cd worker && python worker.py
```

Questa documentazione fornisce una panoramica completa del sistema Olifogli per permettere a una AI di comprendere rapidamente la struttura e implementare modifiche o estensioni al sistema.