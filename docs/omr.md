# Scansioni OMR e generazione dei fogli

La lettura ottica delle schede (OMR) e la generazione dei fogli risposta
personalizzati sono svolte da due worker Python del progetto separato
**archiomr** (https://github.com/fph/archiomr). Olifogli e i worker comunicano
solo tramite directory condivise e MongoDB.

| | `oliscan` | `olisheet` |
|---|---|---|
| Cosa fa | Legge le schede scansionate | Genera i PDF dei fogli risposta da stampare |
| Elaborazione | PDF → PNG (Ghostscript) → correzione del colore (ImageMagick) → OMRChecker | Righe JSONL → `template.tex` (Jinja2) → `latexmk` |
| Input | `{schema}-{jobId}.pdf` in `SCANS_SPOOL_DIR` | `{schema}-{jobId}.jsonl` in `SHEETGENSPOOL_DIR` |
| Output | `{jobId}/{jobId}_001.png`… in `SCANS_DATA_DIR`, un documento per pagina in `scan_results` | `{jobId}/{schema}-{jobId}.pdf` in `SHEETGENDATA_DIR` |
| Stato | Messaggi aggiunti a `scan_jobs.messages` | Campi `status` e `message` di `scan_sheet_jobs` |
| Template | `templates/{schema}/omr/template.json` | `templates/{schema}/tex/template.tex` |

Le immagini Docker, che includono i template, sono pubblicate su
`harbor.cs.dm.unipi.it/olifogli/` con le stesse convenzioni di Olifogli (vedi
[README](../README.md#rami-ci-e-staging)):

| Tag | Da dove viene | Dove si usa |
|---|---|---|
| `:staging` | ramo `staging` di archiomr | server di staging |
| `:main` | ramo `main` di archiomr | produzione |
| `:vX.Y.Z` | tag di versione | per fissare o ripristinare una versione |

Lo sviluppo di nuovi template è descritto nel README di archiomr; il protocollo
con Olifogli è descritto nella sezione *Protocol with Olifogli* dello stesso
README.

Questa pagina descrive le immagini dalla `v0.7.0` in poi: segnale di vita in
`omr_workers`, ripresa dei lavori interrotti, permessi dei file (`UMASK`).

## Schemi supportati

Il nome dello schema del foglio (`schema.name`) è anche il nome del template in
archiomr. Hanno sia il template sia la conversione dei risultati
(`scans_to_data_dict`) gli schemi `archimede_biennio`, `archimede_triennio`,
`gara_prime`, `distrettuale` e `ammissione_senior`. Per aggiungere la scansione a
un nuovo schema servono entrambi.

## Protocollo delle directory di spool

I due worker funzionano allo stesso modo:

1. ogni 10 secondi (`CHECK_INTERVAL`) cercano nella directory di spool un file
   con l'estensione attesa (`.pdf` o `.jsonl`), solo al primo livello;
2. lo spostano in `processing/` e lo elaborano, uno alla volta, in una cartella
   temporanea `tmp/{jobId}`;
3. al termine lo spostano in `completed/` oppure, in caso di errore, in `aborted/`.
   La cartella `tmp/{jobId}` viene cancellata in entrambi i casi, salvo che sia
   impostata `KEEP_TMP_FOLDERS`.

Il nome del file indica template e lavoro, separati dal trattino:
`{schema}-{jobId}.{estensione}`. I nomi degli schemi non devono quindi contenere
trattini. Un file il cui nome non rispetta questo formato finisce subito in
`aborted/`. In `olisheet` il campo `id` di ogni record del JSONL deve essere una
stringa di al massimo 4 cifre.

Sottocartelle (`processing/`, `completed/`, `aborted/`, `tmp/`) e collezioni
MongoDB sono fisse: le variabili che le rendevano configurabili
(`PROCESSING_DIR`, `ABORTED_DIR`, `COMPLETED_DIR`, `TMP_DIR`, `COLLECTION_NAME`,
`RESULTS_COLLECTION_NAME`) sono state eliminate.

**Lavori interrotti.** All'avvio ogni worker sposta in `aborted/` i file rimasti
in `processing/` da un'esecuzione precedente e segna il lavoro come fallito, con
un messaggio che dice che l'elaborazione è stata interrotta da un riavvio del
servizio. Il meccanismo presuppone **una sola istanza per directory di spool**:
una seconda istanza appena avviata considererebbe interrotti i lavori in corso
nella prima.

Olifogli crea i file con `stageSpoolFile` (`app/lib/spool.ts`): scrive il
contenuto con il suffisso `.part`, che i worker ignorano, e lo rinomina nella
stessa directory solo dopo aver registrato il lavoro in MongoDB. In questo modo
un worker non legge mai un file scritto a metà, e se la scrittura o la
transazione falliscono non restano né il file né il lavoro, e i contatori del
foglio (`nScanJobs`, `nScanSheetJobs`) restano corretti. Un file `.part` può
restare solo se il processo si interrompe tra la scrittura e la rinomina: è
innocuo e si può cancellare.

## Flusso in Olifogli

### Scansioni

1. L'utente carica il PDF dalla linguetta **Gestione lettura ottica** del foglio (serve il
   permesso di modificare le righe). `POST /api/upload`
   (`app/api/upload/route.ts`) crea il `scan_job` e pubblica il file per
   `oliscan`.
2. Il `ws-server` osserva `scan_jobs` e `scan_results` con i change stream e
   invia `scanJobUpdated`: la scheda mostra l'avanzamento e i risultati man mano
   che arrivano.
3. `app/components/ScansImport.tsx` converte i `rawData` di ogni pagina nei campi
   del foglio con lo schema (`scans_to_data_dict`) e li abbina alle righe
   esistenti tramite il codice studente (`id`), confrontato senza zeri iniziali
   (`app/lib/schema/scanMatching.ts`). Un codice vuoto, fatto solo di `X` o
   uguale a zero non viene abbinato a nessuna riga: la pagina crea una riga
   nuova senza codice. Le pagine dello stesso caricamento con lo stesso codice
   sono evidenziate e non si possono importare, perché si sovrascriverebbero a
   vicenda. OMRChecker usa `X` per le domande senza risposta. Se in una domanda
   sono annerite quattro caselle su cinque, vale la lettera rimasta bianca.
4. L'import è manuale: l'utente seleziona le righe e Olifogli le crea
   (`addRow`) o aggiorna solo i campi cambiati (`patchRow`).

Le immagini elaborate si vedono da `/scan/{jobId}/image/{file}`, il PDF originale
da `/scan/{jobId}/pdf`, che lo cerca in `completed/`, `processing/` e `aborted/`.

### Generazione dei fogli

La mutation `requestScanSheetGeneration` (riservata ai responsabili del foglio, ruolo `manager`) scrive
le righe selezionate, o tutte, in un file JSONL per `olisheet`, una riga JSON per
studente con `sheet_name` e i dati della riga. Il PDF generato si scarica da
`/scansheet/{jobId}/pdf`.

La linguetta **Gestione lettura ottica** del foglio ha tre sezioni, nell'ordine
delle operazioni: **Generazione fogli-risposta a lettura ottica** (solo per i
responsabili del foglio), **Fogli-risposta generati** e **Caricamento
scansioni**. Nella prima, il pulsante **Genera fogli-risposta** chiama la
mutation senza `selectedRowIds`, quindi per tutte le righe del foglio. Per
generare i fogli solo per alcuni studenti si selezionano le righe nella
linguetta **Inserimento dati** e si sceglie la voce di menu **Genera
fogli-risposta per la selezione**.

`olisheet` produce una pagina per record. In fondo al file JSONL Olifogli
aggiunge sempre un record senza dati personali, con il solo `sheet_name`: è il
foglio vuoto da fotocopiare per i partecipanti non registrati. Con
`selectedRowIds: []` il file contiene solo questo record e il PDF solo il foglio
vuoto: è quello che fa il pulsante **Genera foglio vuoto** della linguetta
**Gestione lettura ottica**. Le versioni di `olisheet` precedenti all'accordo aggiungevano da
sé un'ulteriore pagina completamente vuota. Il lavoro in `scan_sheet_jobs` registra
`nRows` (pagine con gli studenti) e `nBlankSheets` (pagine bianche, per ora
sempre 1); la tabella dei PDF generati li mostra nella colonna «Contenuto». I
lavori creati prima che questi campi esistessero non li hanno.

Dalla tabella dei PDF generati i responsabili del foglio (e gli amministratori)
possono eliminare una generazione con la mutation `deleteScanSheetJob`: cancella
prima tutti i file del lavoro (il PDF in `SHEETGENDATA_DIR` ed eventuali file
rimasti nello spool), poi il documento in `scan_sheet_jobs`, aggiornando
`nScanSheetJobs`. Se un file non si può cancellare (vedi «Permessi dei file») il
lavoro resta nel database. Non si può eliminare un lavoro in elaborazione
(`processing`).

## Segnale di vita dei worker

Dalla `v0.7.0` i worker scrivono un segnale di vita nella collezione
`omr_workers`, con lo stesso schema del worker di Olifogli
(`app/lib/workerHeartbeat.ts`), ma in una collezione separata: mescolarli farebbe
risultare attivo il worker di Olifogli. C'è un documento per istanza in
esecuzione:

| Campo | Contenuto |
|---|---|
| `_id` | `{type}:{hostname}` |
| `type` | `oliscan` oppure `olisheet` |
| `version` | `vX.Y.Z` per le immagini dei tag di versione, `main-<sha>` o `staging-<sha>` per quelle dei rami, `dev` per le build locali |
| `startedAt` | Avvio dell'istanza |
| `lastSeenAt` | Ultimo segnale, aggiornato ogni 10 secondi anche durante i lavori lunghi |
| `state` | `idle` oppure `busy` |
| `jobId` | Lavoro in corso, oppure `null` |
| `busySince` | Inizio del lavoro in corso, oppure `null` |

Un'istanza è attiva se `lastSeenAt` ha meno di 35 secondi
(`WORKER_HEARTBEAT_TIMEOUT_MS`). Allo spegnimento normale il documento viene
cancellato; un indice TTL su `lastSeenAt`, creato dai worker, rimuove dopo un
giorno quelli delle istanze morte.

Olifogli legge la collezione con `getOmrWorkerStatus` (`app/lib/omrWorkers.ts`),
esposta dalla query GraphQL `omrWorkerStatus` a tutti gli utenti autenticati: per
ogni tipo restituisce se è attivo, il numero di istanze attive, l'ultimo segnale
e, per ogni istanza attiva, versione, stato e lavoro in corso.

Il componente `OmrWorkerStatus` mostra lo stato, aggiornato ogni 10 secondi, in
cima alla sezione **Caricamento scansioni** (`oliscan`) e alla sezione
**Generazione fogli-risposta a lettura ottica** (`olisheet`; per chi non è
responsabile del foglio, alla sezione **Fogli-risposta generati**) della
linguetta **Gestione lettura ottica** del foglio. Lo stato attivo (verde) e
la verifica in corso sono visibili solo agli amministratori, con ⚙ davanti;
gli avvisi sono visibili a tutti. Accanto
allo stato attivo mostra la versione riportata nello heartbeat; se le istanze
attive hanno versioni diverse, le elenca tutte senza duplicati. Se il
worker non è attivo avvisa che i file resteranno in coda. Se un'istanza è
`busy` da più di 30 minuti (`OMR_WORKER_STUCK_MS`) mostra un avviso: il segnale
dice che il processo è vivo, non che il lavoro stia procedendo, e un OMRChecker
bloccato continuerebbe a inviarlo.

Con immagini precedenti alla `v0.7.0` la collezione resta vuota e i worker
risultano sempre non attivi.

## Pagina «file» per gli amministratori

La voce **file** del menu che si apre cliccando l'email in alto a destra apre
la pagina `/files` (`app/components/WorkerFiles.tsx`), visibile solo agli amministratori.
Mostra i file delle quattro directory condivise come un browser a cartelle, con
il percorso nella barra di intestazione (`file › Scansioni › …`):

- al primo livello ci sono **Scansioni**, **Fogli generati** e **Orfani**;
- scansioni e fogli generati sono divisi per raccoglitore, poi per foglio
  (ordinati per spazio occupato), poi per lavoro, indicato con data e stato;
- **Orfani** raccoglie i file di lavori non più presenti nel database (rimasti
  dopo l'eliminazione della scansione) e quelli senza un ID di lavoro nel nome;
- dentro un lavoro si vedono i singoli file, con la fase del worker (in coda,
  in scrittura, in elaborazione, completato, annullato, temporaneo, dati), e si
  possono aprire (PDF e immagini, con anteprime facoltative), scaricare o
  cancellare.

La posizione è nei parametri dell'URL (`kind`, `workbook`, `sheet`, `job`),
quindi il tasto Indietro funziona e il link a una cartella si può condividere.
A ogni livello si possono selezionare e cancellare più voci: si cancellano tutti
i file dei lavori che contengono.

La cancellazione riguarda **solo i file**: i lavori e i risultati in MongoDB non
cambiano, ma immagini e PDF cancellati non saranno più visibili dal foglio.
Dopo la cancellazione vengono rimosse le cartelle dei lavori rimaste vuote, ma
non `processing/`, `completed/`, `aborted/` e `tmp/`. Anche i file in
`processing/` sono cancellabili, con un avviso: se il worker li sta ancora
elaborando, l'elaborazione fallisce o resta bloccata. Serve anche a ripulire i
lavori rimasti bloccati dopo un arresto del worker.

I file vengono serviti da `GET /api/worker-files?area=…&path=…` (con
`download=1` per scaricarli). Le operazioni GraphQL sono `workerFiles`,
`workerFileGroupFiles`, `deleteWorkerFiles` e `deleteWorkerFileGroup`, tutte
riservate agli amministratori. I percorsi sono verificati in
`app/lib/workerFiles.ts`: devono stare dentro una delle directory configurate e
non possono attraversare link simbolici, che non vengono né elencati né seguiti.

### Permessi dei file

Per cancellare un file, l'utente con cui gira Olifogli deve poter scrivere nella
cartella che lo contiene. Olifogli nell'immagine Docker gira come utente
`nextjs` (uid 1001), mentre i worker girano come root. Per questo i worker
applicano la `umask` indicata dalla variabile `UMASK` (default `000`): file e
cartelle che creano (`{jobId}/` nelle directory dei dati, `tmp/{jobId}/`,
`processing/`, `completed/`, `aborted/`) sono scrivibili da tutti e quindi
cancellabili dall'applicazione.

Le immagini precedenti alla `v0.7.0` creavano invece cartelle con permessi
`755`. Le cartelle create prima dell'aggiornamento vanno sistemate una volta sul
server, sui volumi condivisi, per esempio:

```sh
sudo chmod -R a+rwX spool data sheetgenspool sheetgendata
```

Dopo ogni cancellazione la pagina mostra quanti file sono stati cancellati e
l'elenco di quelli rimasti, con il motivo: permessi insufficienti, file non più
presente o errore imprevisto. I file bloccati dai permessi si possono sempre
cancellare sul server, per esempio con
`sudo docker compose exec oliscan rm -r /app/data/{jobId}`.

## Configurazione

| Variabile | Default | Uso |
|---|---|---|
| `SCANS_SPOOL_DIR` | nessuno: senza, l'upload è disattivato | PDF da leggere, condivisa con `oliscan` (`SPOOL_DIR`) |
| `SCANS_DATA_DIR` | nessuno | Immagini elaborate, condivisa con `oliscan` (`DATA_DIR`) |
| `SHEETGENSPOOL_DIR` | `/app/sheetgenspool` | Richieste di generazione, condivisa con `olisheet` |
| `SHEETGENDATA_DIR` | `/app/sheetgendata` | PDF generati, condivisa con `olisheet` |

I worker devono usare lo stesso MongoDB dell’applicazione, configurato con
`MONGODB_URI`. Non usare il vecchio nome `MONGO_URI`: le immagini recenti
non lo leggono e `oliscan` lavora senza database, senza aggiornare lo stato
dei lavori né il segnale di vita. Senza MongoDB `oliscan` salva i risultati in
`{DATA_DIR}/{jobId}/results.jsonl` (JSON valido, un oggetto per riga), utile solo
per le prove.

Altre variabili dei worker:

| Variabile | Default | Uso |
|---|---|---|
| `CHECK_INTERVAL` | `10` | Secondi tra due controlli dello spool; `-1` elabora i file presenti ed esce |
| `UMASK` | `000` | `umask` per file e cartelle creati (vedi [Permessi dei file](#permessi-dei-file)) |
| `KEEP_TMP_FOLDERS` | `false` | Se vera, conserva `tmp/{jobId}` dopo l'elaborazione, per il debug |
| `ADJUST_COLORSPACE` | attiva | Correzione del colore di `oliscan`; si disattiva con `false`, `0`, `no`, `off` o con il valore vuoto |
| `DB_NAME` | `olifogli` | Database dei worker: deve coincidere con quello usato da Olifogli; nei worker il nome nell’URI non sostituisce questa variabile |

## Sviluppo locale

I worker non sono necessari per sviluppare Olifogli: senza di loro i lavori
restano in coda e i file restano nella cartella principale dello spool. Per
provarli servono una copia di archiomr e Docker.

1. In `.env` configura le quattro directory, per esempio dentro il repository
   (le cartelle `worker/` e `sheetgenworker/` sono già ignorate da git):

   ```
   SCANS_SPOOL_DIR=/percorso/olifogli/worker/spool
   SCANS_DATA_DIR=/percorso/olifogli/worker/data
   SHEETGENSPOOL_DIR=/percorso/olifogli/sheetgenworker/sheetgenspool
   SHEETGENDATA_DIR=/percorso/olifogli/sheetgenworker/sheetgendata
   ```

   Crea le directory prima di avviare i worker: altrimenti le crea Docker,
   come root.

2. Dalla directory di Olifogli avvia i worker. Il `docker-compose.yml` del
   repository li definisce nel profilo `omr`, con le immagini `:main`
   pubblicate su `harbor.cs.dm.unipi.it/olifogli`:

   ```sh
   docker compose --profile omr up -d oliscan olisheet
   docker compose --profile omr logs -f oliscan olisheet
   ```

   Compose legge le quattro directory da `.env` e le monta nei percorsi
   predefiniti dei container (`/app/spool`, `/app/data`, `/app/sheetgenspool`,
   `/app/sheetgendata`). I worker usano la rete dell'host e si collegano a
   `mongodb://127.0.0.1:27017/olifogli?directConnection=true`: va bene il
   MongoDB di questo Compose o qualunque altro replica set in ascolto su quella
   porta. Si fermano con `docker compose --profile omr stop oliscan olisheet`.

   Per provare una versione non pubblicata, costruisci le immagini in archiomr
   (`docker compose build oliscan olisheet`, etichetta `:latest`) e cambia il
   tag nel Compose.

   Il database è `olifogli` per impostazione predefinita (variabile `DB_NAME`
   dei worker). Con `CHECK_INTERVAL=-1` il worker elabora i file presenti ed
   esce.

I file creati dai container appartengono a root ma, con la `UMASK` di default,
sono scrivibili da tutti: vedi [Permessi dei file](#permessi-dei-file). Le istruzioni per creare o modificare
i template sono nel README di archiomr.

## Limiti noti

- **Una sola istanza per spool.** La ripresa dei lavori interrotti all'avvio
  presuppone che nessun'altra istanza stia lavorando sulla stessa directory.
- **Eliminazione di una scansione.** Eliminare una scansione da Olifogli non
  cancella i suoi file: restano visibili nella pagina **file**, da cui si
  possono cancellare.
- Il README di archiomr cita un commit di OMRChecker diverso da quello usato nel
  Dockerfile (da correggere in archiomr).
