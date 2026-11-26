# Worker dei lavori in background

Il worker Olifogli (`olifogli-worker.ts`) esegue i lavori lunghi accodati
dall'interfaccia:

| Lavoro (`operation`) | Azione | Richiede OAuth |
|---|---|---|
| `check_participants` | **Verifica collegamenti olimanager** | sì |
| `match_or_create_participants` | **Crea/abbina partecipanti su olimanager** | sì |
| `update_results` | **Invia risultati su olimanager** | sì |
| `import_participants` | **Importa partecipanti da Olimanager** (linguetta Fogli) | sì, solo per l'anteprima |
| `crypt_sheets` | **Cripta** | no |
| `decrypt_sheets` | **Decripta** | no |

L'aggiornamento degli extra fields resta sincrono. I vecchi resolver sincroni di
creazione e invio risultati sono ancora disponibili per compatibilità, ma i
pulsanti dell'interfaccia accodano lavori. Le azioni sui fogli (tutte tranne
**Importa partecipanti da Olimanager**) si scelgono, per i fogli selezionati,
dal menu a tendina «agisci su N fogli selezionati» nel riquadro «⚙ admin» in
fondo all'elenco dei fogli. La selezione resta quando si cambiano i filtri, così
si possono cercare e aggiungere fogli con filtri diversi; la casella
nell'intestazione seleziona o deseleziona tutti i fogli filtrati, anche quelli
oltre il limite mostrato. Lo stesso menu apre i moduli **Modifica dati comuni…**
e **Concedi permesso…**. Tutte le azioni agiscono su tutti i fogli selezionati:
le conferme, e i moduli accanto al numero di fogli, indicano quanti non sono
visibili.

Il codice è in `app/lib/olimanagerJobs.ts` (coda, lease, ciclo di esecuzione) e
nei moduli `app/lib/olimanager*.ts`; i resolver GraphQL sono in
`app/graphql/resolvers/olimanagerJobs.ts`.

## Avvio

```sh
npm run olifogli:worker            # resta in attesa di nuovi lavori
npm run olifogli:worker -- --once  # elabora al massimo un lavoro ed esce
```

Il worker carica la configurazione `.env*` come Next.js, rispettando le
variabili esportate e `NODE_ENV`. Usa gli stessi `MONGODB_URI`,
`NEXTAUTH_SECRET` e `REDIS_URL` dell'applicazione; per i lavori Olimanager serve
anche `OLIMANAGER_GRAPHQL_ENDPOINT`. Servono le transazioni MongoDB, quindi un
replica set (già previsto dal Compose).

In produzione l'immagine include `olifogli-worker.js` e i Compose di esempio
prevedono il servizio `olifogli-worker` con riavvio automatico. Per aggiornare
un Compose esistente, rinominare il vecchio servizio `olimanager-worker` e
rimuovere il relativo container con `docker compose up -d --remove-orphans`.

Il ciclo principale (`runWorkerLoop`, `app/lib/workerLoop.ts`) non termina se
un lavoro fallisce o MongoDB dà un errore transitorio: registra l'evento
`olifogli.worker.iteration_failed` e riprova dopo una pausa che raddoppia a ogni
errore consecutivo (da 1 a 30 secondi). Così le chiavi in memoria degli altri
lavori di cifratura non vanno perse. Con `--once` l'errore termina il processo.

Riavviare il worker dopo ogni aggiornamento del codice; se cambia lo schema
GraphQL, riavviare anche il server WebSocket.

## Pannello «Operazioni in background»

L'icona a ingranaggio nella barra superiore è visibile agli amministratori su
tutte le pagine (`app/components/BackgroundOperations.tsx`):

- gira, ed è blu, quando ci sono lavori in stato `queued`, `preparing` o
  `running` (query `olimanagerActiveJobs`);
- un punto blu segnala aggiornamenti arrivati mentre il pannello era chiuso;
- un clic apre il pannello con gli ultimi 20 lavori, per tutti i fogli.

Il server WebSocket osserva `olimanager_jobs` con i change stream di MongoDB e
invia agli amministratori la subscription `olimanagerJobsUpdated` quando
cambiano stato o conteggi (ignora i rinnovi della lease). Il segnale non contiene
dati: il client ricarica le query interessate, raggruppando le notifiche
ravvicinate entro 500 ms. Alla connessione e a ogni riconnessione il server
invia un primo segnale, per recuperare gli aggiornamenti persi. **Aggiorna stato**
resta disponibile anche senza notifiche. Il pannello si chiude con la croce o Esc.

Il pannello mostra anche se almeno un worker è in esecuzione, anche senza lavori
accodati. Ogni processo annuncia la propria presenza ogni 10 secondi nella
collezione `olifogli_workers`; il pannello controlla lo stato ogni 10 secondi
mentre è aperto. Un segnale più vecchio di 35 secondi non è considerato attivo,
quindi un arresto improvviso viene rilevato entro circa 45 secondi; un arresto
regolare rimuove subito la presenza. Con più worker viene mostrato il numero di
istanze attive. Se la lettura fallisce compare **Stato non verificabile**. I
segnali scaduti vengono eliminati da MongoDB dopo 24 ore.

## Ciclo di vita dei lavori

I lavori sono salvati in `olimanager_jobs`, con `rowIds` e `sheetIds`
indipendenti: entrambi possono essere popolati e il lavoro riguarda la loro
unione. La preparazione registra la selezione in `olimanager_job_items`, con un
indice univoco `(jobId, rowId)`; dopo la preparazione la selezione non viene più
ricalcolata.

Stati: `queued` → `preparing` → `running` → `completed`,
`completed_with_errors` oppure `failed`. Un lavoro Olimanager il cui token è
scaduto passa a `needs_login` (vedi sotto). Ogni item conserva stato, tentativi,
esito, campi anagrafici diversi ed eventuale errore. Gli errori dei lavori
restano negli item e non sovrascrivono `row.olimanager.error`, che riguarda i
trasferimenti effettivi.

### Fogli riservati

Sono accettati solo fogli finalizzati (`locked`) per le operazioni Olimanager;
la sola chiusura non basta. Al momento dell'accodamento i fogli vengono riservati
al lavoro (`sheet.olimanagerJobId`): non possono essere sbloccati, riaperti o
inclusi in un altro lavoro attivo fino alla conclusione. In questa prima versione
si assume che gli amministratori non modifichino o cancellino i dati nel
frattempo.

### Lease e ripresa

Il worker acquisisce una lease di 60 secondi e salva i progressi in transazioni
dopo ogni riga remota (blocchi di 200 per i vecchi controlli locali). Le
richieste remote sono seriali, distanziate di almeno 250 ms, con timeout di
15 secondi. Dopo un arresto un altro worker può riprendere il lavoro alla
scadenza della lease; un arresto regolare la rende subito disponibile. Gli item
già completati non vengono rieseguiti. Gli indici vengono creati in modo
idempotente all'accodamento e all'avvio del worker.

### Token OAuth delegato

Il token OAuth viene delegato al singolo lavoro, cifrato con `NEXTAUTH_SECRET` e
vincolato a utente, lavoro ed endpoint. La collezione privata
`olimanager_job_credentials` non è esposta via GraphQL; le credenziali sono
eliminate alla conclusione o alla scadenza.

Se il token scade o viene rifiutato, il lavoro passa a `needs_login` mantenendo
i fogli riservati. Lo stesso amministratore può rifare il login con scope `api`
e premere **Riprendi con la sessione attuale**: il worker prosegue dalle sole
righe ancora da elaborare.

## Verifica Olimanager

La verifica legge i collegamenti esistenti e confronta nome, cognome, data di
nascita, anno di corso e sezione con Olimanager. Controlla anche gara e scuola.
Richiede finalizzazione, schema e configurazione di gara e scuola.

Le righe senza `participantId` vengono segnalate come non abbinate. La verifica
non cerca nuovi abbinamenti, non crea partecipanti, non invia risultati e non
modifica le righe del foglio. Le righe criptate sono segnalate come non
verificabili. I vecchi lavori privi della modalità remota mantengono la
precedente verifica locale.

## Creazione e abbinamento dei partecipanti

Il comando usa la mutation Olimanager `matchOrCreateParticipant` per le righe
selezionate o per tutti i fogli selezionati, e può creare concorrenti e
partecipanti su Olimanager. Il risultato viene salvato sulla riga insieme all'ID
gara, nella stessa transazione dell'esito del lavoro.

- Le righe assenti vengono saltate; quelle non valide o criptate producono un
  errore nel dettaglio del lavoro.
- I collegamenti già presenti vengono verificati in sola lettura: non vengono
  sostituiti né migrati verso un'altra gara.
- Il pannello distingue partecipanti creati, trovati e già collegati, e segnala
  gli abbinamenti multipli restituiti da Olimanager.
- Non vengono inviati risultati né extra fields.

La scuola deve essere iscritta all'edizione e, per gare non scolastiche, deve
esistere una sede compatibile su Olimanager.

**Atomicità.** La chiamata remota e la transazione locale non sono atomiche tra
loro. Se il worker si interrompe dopo la risposta remota ma prima del salvataggio
locale, una ripresa può richiamare `matchOrCreateParticipant`, che trova il
partecipante già creato. Gli item completati non vengono ripetuti; gli errori di
rete o di risposta vengono segnalati senza nuovi tentativi automatici. Verificare
l'esito remoto prima di accodare di nuovo una riga fallita.

## Invio dei risultati

Il comando accoda un lavoro `update_results`. Per ogni riga valida non assente:

1. controlla il collegamento remoto (gara, scuola e anagrafica); le righe non
   collegate producono un errore: occorre prima creare/abbinare il partecipante;
2. estrae i punteggi dei singoli esercizi con lo schema del foglio e verifica che
   la loro somma corrisponda al totale locale;
3. legge il partecipante, inclusi `problemResults` e totale, nella stessa
   richiesta usata per il controllo;
4. confronta e, se serve, invia.

### Confronto con lo storico

Se punteggi, squalifiche dei singoli esercizi e totale coincidono, il lavoro
registra **Risultati già corrispondenti** senza mutation. Dopo un invio riuscito
(o dopo questa verifica di uguaglianza) la riga conserva uno storico
`olimanager.resultsSnapshot`, vincolato a endpoint, gara e partecipante.

- Un cambiamento solo locale può essere inviato se il remoto coincide ancora con
  lo storico.
- Modifiche remote inattese, totali corretti a mano e primi invii con valori
  remoti diversi producono **Disallineamento nei risultati da risolvere**: nessuna
  scrittura remota, con il dettaglio Olifogli/Olimanager di ogni esercizio
  diverso. Non c'è ancora un comando per forzare la risoluzione del conflitto.
- I vecchi collegamenti senza storico lo acquisiscono solo quando i risultati
  coincidono; un remoto completamente vuoto consente il primo invio.
- Se uno storico esiste e i risultati remoti vengono cancellati, la cancellazione
  è un conflitto.

In caso di conflitto timestamp, storico e contatori locali restano invariati. La
verifica in sola lettura dell'anagrafica non richiede i punteggi.

### Scrittura

La mutation `bulkUpdateResults` invia una riga alla volta, con punteggi assoluti:
una ripetizione dopo un'interruzione riscrive gli stessi valori. Dopo
`BulkUpdateResultsSuccess`, o dopo la verifica di risultati già corrispondenti,
il worker registra `row.olimanager.resultsUpdatedOn`, l'esito del lavoro e
l'eventuale incremento di `sheet.nSyncedRows` nella stessa transazione. Righe già
sincronizzate possono essere reinviate senza incrementare di nuovo il contatore.
Errori e righe assenti non vengono marcati come sincronizzati.

Il confronto non è un controllo di versione atomico sul provider: una modifica
remota tra la lettura e la mutation può ancora essere sovrascritta. Per eliminare
questa finestra servirebbe un supporto compare-and-set nell'API Olimanager. Non
vengono eseguite letture aggiuntive dopo l'invio.

## Importazione dei partecipanti

Il lavoro `import_participants` riguarda i fogli di un raccoglitore con lo
stesso schema e contest (`workbookId`, `importSchema`, `importContestId`) e non
richiede che siano finalizzati. Il codice è in
`app/lib/olimanagerParticipantImport.ts`; `runNextOlimanagerJob` gli passa il
lavoro tramite l'opzione `runImport`.

1. **Preparazione**: legge il contest da Olimanager, scrive un item per ogni riga
   da creare (con `rowId` già assegnato e i dati in `importData`) e le
   segnalazioni in `warnings`, poi passa a `awaiting_confirmation` eliminando la
   delega OAuth e liberando i fogli. Se il token scade il lavoro va in
   `needs_login`; la ripresa rifà la lettura da capo. Se non c'è nulla da
   aggiungere il lavoro è subito `completed`.
2. **Conferma** (`confirmOlimanagerImport`): riserva di nuovo i fogli e rimette
   il lavoro in `queued`. In alternativa **Annulla** porta il lavoro a
   `cancelled` e cancella gli item con i dati personali.
3. **Creazione**: a blocchi di 100, ogni riga viene inserita con l'`_id`
   preassegnato insieme a esito dell'item e contatori del foglio. Un
   partecipante già collegato a una riga dei fogli è saltato (`already_present`),
   quindi una ripresa non crea duplicati. Al termine `importData` viene rimosso
   dagli item.

Gli stati `awaiting_confirmation` e `cancelled` esistono solo per questo lavoro
e non sono contati tra i lavori attivi.

## Crittografia e decrittazione dei fogli

**Cripta** e **Decripta** accodano lavori
`crypt_sheets` e `decrypt_sheets`. Non richiedono OAuth, un endpoint Olimanager
o la finalizzazione dei fogli.

App e worker devono avere `REDIS_URL` e lo stesso `NEXTAUTH_SECRET`. Per
cifrare, l'app deriva la chiave PBKDF2 in memoria e la consegna al worker tramite
Redis **Pub/Sub**, in una busta cifrata e autenticata con il segreto del server.
Per decriptare consegna la password con lo stesso canale: il worker deriva in
memoria una chiave per ogni salt presente nelle righe, anche quando provengono da
cifrature fatte in momenti diversi. Password, chiavi e buste non vengono salvate
in MongoDB, in chiavi Redis o nei log, e sono eliminate dalla memoria del worker
al termine del lavoro. Il formato dei dati cifrati è compatibile con i dati
preesistenti.

- Cripta ignora le righe già cifrate; Decripta ignora quelle già in chiaro.
- Password errata o dati cifrati danneggiati producono un errore per riga: il
  contenuto cifrato resta intatto.
- Il ripristino dei campi e la rimozione di `encrypted_data` avvengono nella
  stessa transazione.

Il worker deve essere attivo quando si preme il pulsante: se non conferma la
ricezione della chiave, la richiesta fallisce e libera i fogli. Se la chiave va
persa per un arresto del worker, il lavoro viene segnato come fallito alla
scadenza della disponibilità della chiave (entro circa un minuto dalla ripresa
del worker). Basta avviare di nuovo **Cripta** o **Decripta** con la stessa
password: le righe già elaborate vengono saltate.

## Prove in sviluppo e su staging

### Coda e pannello

1. Accedere come amministratore con scope OAuth `api` e permessi sulla gara
   Olimanager. Lasciare spento il worker e accodare una verifica su fogli
   finalizzati: il lavoro resta in attesa e l'ingranaggio gira.
2. Avviare `npm run olifogli:worker -- --once`: elabora al massimo un lavoro ed
   esce.
3. Aprire il pannello per vedere conteggi ed esiti delle singole righe.

### Creazione di un partecipante

Accedere con scope `api`, finalizzare il foglio, selezionare una riga valida non
collegata e usare **Crea/abbina partecipanti su olimanager**. Il pannello mostra
il nuovo `participantId`; le righe aperte si aggiornano insieme alle notifiche
dei lavori. Si può poi lanciare una verifica sul collegamento appena creato.

### Invio dei risultati

Accedere con scope `api` e scegliere una riga valida, finalizzata e già
collegata. Usare **Invia risultati su olimanager** e controllare
**Risultati inviati** nel pannello. Confrontare il totale del partecipante su
staging e la data di sincronizzazione locale. Un token scaduto segue lo stesso
percorso `needs_login` delle altre operazioni.
