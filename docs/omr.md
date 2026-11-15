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

Le immagini Docker sono pubblicate su `harbor.cs.dm.unipi.it/olifogli/` a ogni
tag di versione di archiomr e includono i template. Lo sviluppo di nuovi template
è descritto nel README di archiomr.

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
2. lo spostano in `processing/` e lo elaborano, uno alla volta;
3. al termine lo spostano in `completed/` oppure, in caso di errore, in `aborted/`.

Il nome del file indica template e lavoro, separati dal trattino:
`{schema}-{jobId}.{estensione}`. I nomi degli schemi non devono quindi contenere
trattini.

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

1. L'utente carica il PDF dalla linguetta **Importa scansioni** del foglio (serve il
   permesso di modificare le righe). `POST /api/upload`
   (`app/api/upload/route.ts`) crea il `scan_job` e pubblica il file per
   `oliscan`.
2. Il `ws-server` osserva `scan_jobs` e `scan_results` con i change stream e
   invia `scanJobUpdated`: la scheda mostra l'avanzamento e i risultati man mano
   che arrivano.
3. `app/components/ScansImport.tsx` converte i `rawData` di ogni pagina nei campi
   del foglio con lo schema (`scans_to_data_dict`) e li abbina alle righe
   esistenti tramite il codice studente (`id`). OMRChecker usa `X` per le
   domande senza risposta. Se in una domanda sono annerite quattro caselle su
   cinque, vale la lettera rimasta bianca.
4. L'import è manuale: l'utente seleziona le righe e Olifogli le crea
   (`addRow`) o aggiorna solo i campi cambiati (`patchRow`).

Le immagini elaborate si vedono da `/scan/{jobId}/image/{file}`, il PDF originale
da `/scan/{jobId}/pdf`, che lo cerca in `completed/`, `processing/` e `aborted/`.

### Generazione dei fogli

La mutation `requestScanSheetGeneration` (riservata agli admin del foglio) scrive
le righe selezionate, o tutte, in un file JSONL per `olisheet`, una riga JSON per
studente con `sheet_name` e i dati della riga. Il PDF generato si scarica da
`/scansheet/{jobId}/pdf`.

## Configurazione

| Variabile | Default | Uso |
|---|---|---|
| `SCANS_SPOOL_DIR` | nessuno: senza, l'upload è disattivato | PDF da leggere, condivisa con `oliscan` (`SPOOL_DIR`) |
| `SCANS_DATA_DIR` | nessuno | Immagini elaborate, condivisa con `oliscan` (`DATA_DIR`) |
| `SHEETGENSPOOL_DIR` | `/app/sheetgenspool` | Richieste di generazione, condivisa con `olisheet` |
| `SHEETGENDATA_DIR` | `/app/sheetgendata` | PDF generati, condivisa con `olisheet` |

I worker usano lo stesso MongoDB: `oliscan` legge `MONGO_URI`, `olisheet`
`MONGO_URI` oppure `MONGODB_URI`. Senza MongoDB `oliscan` salva i risultati in
`{DATA_DIR}/{jobId}/results.jsonl`, utile solo per le prove.

## Limiti noti

Riguardano i worker, quindi vanno corretti in archiomr:

- **Lavori interrotti.** Se un worker si ferma durante un'elaborazione, il file
  resta in `processing/` e nessuno lo riprende all'avvio; in Olifogli il lavoro
  resta in corso. Per questo il Compose di produzione consiglia di fermare
  `oliscan` e `olisheet` per primi.
- **`ADJUST_COLORSPACE`** di `oliscan` si disattiva solo con una stringa vuota:
  anche `false` lo lascia attivo.
- **`results.jsonl`** scritto da `oliscan` senza MongoDB non è JSON valido (usa la
  rappresentazione Python dei dizionari).
- **Pulizia.** Dopo un errore `oliscan` lascia la cartella temporanea
  `tmp/{jobId}`. Neanche Olifogli cancella i file quando si elimina una
  scansione.
- Il README di archiomr cita un commit di OMRChecker diverso da quello usato nel
  Dockerfile.
