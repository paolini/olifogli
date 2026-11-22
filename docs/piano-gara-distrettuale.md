# Gara distrettuale: convocazioni e fogli da Olimanager

Stato: **implementato** (novembre 2026), da provare sulla gara distrettuale
2027 prima di eliminare i metodi obsoleti. Questo documento spiega come
funzionano le convocazioni alla gara distrettuale, come sono realizzate in
Olimanager e come le gestisce Olifogli, in modo da non ripetere le ricerche.
L'uso delle funzioni è descritto in
[olimanager.md](olimanager.md#importazione-dei-partecipanti). I punti non
confermati sono indicati come **dubbi**.

## Il processo

1. **Archimede.** I Referenti di Istituto (RI) inseriscono in Olifogli
   anagrafiche e risposte dei Giochi di Archimede; a fine correzione i dati
   vengono trasferiti in Olimanager come partecipanti dei contest scolastici.
2. **Segnalazioni degli RI.** Entro una scadenza gli RI indicano in Olimanager
   gli studenti meritevoli della propria scuola.
3. **Gara delle prime.** Nello stesso periodo si svolge la gara delle prime (vedi
   [sotto](#gara-delle-prime)), i cui qualificati possono essere convocati alla
   gara distrettuale.
4. **Convocazioni dei CD.** Fino a una scadenza successiva i CD (vedi
   [Chi fa cosa](#chi-fa-cosa)) decidono i convocati del proprio distretto: confermano o
   modificano le segnalazioni degli RI, aggiungono qualificati della gara delle
   prime e possono aggiungere anche studenti che non hanno partecipato né ad
   Archimede né alla gara delle prime (neanche come assenti). I convocati devono
   essere registrati su Olimanager.
5. **Liste dei convocati.** Dopo la scadenza dei CD lo staff lancia uno script
   che crea in Olimanager i partecipanti della gara distrettuale, distretto per
   distretto. In teoria si lancia una volta sola, ma di solito seguono
   correzioni e dimenticanze, quindi va rilanciato. In linea di principio un
   convocato non viene più tolto (account cancellato, adesione ritirata,
   convocazione revocata); se succede, è un'eccezione.
6. **Fogli in Olifogli.** Si creano i fogli del distretto e vi si importano i
   convocati; l'importazione si ripete dopo ogni nuovo lancio dello script.
7. **Gara distrettuale.** I CD inseriscono in Olifogli risposte e valutazioni
   degli esercizi dimostrativi entro una scadenza; Olifogli calcola i punteggi e
   i dati vengono trasferiti in Olimanager.
8. **Finale.** I CD segnalano in Olimanager i candidati alla finale di
   Cesenatico, entro le quote; uno script dello staff crea l'elenco dei
   convocati alla finale. Una parte dei posti è riservata a livello nazionale
   (per esempio a chi è andato bene alla finale precedente) e viene assegnata
   dagli amministratori.

## Terminologia

Olimanager serve più olimpiadi e usa termini generici; le olimpiadi di
matematica ne usano altri. Le sigle CD, RD e RI non compaiono in Olimanager, e
«distretto» solo in qualche testo delle pagine di una sede.

| API di Olimanager | Interfaccia di Olimanager | Olimpiadi di matematica |
|---|---|---|
| `Zone` | zona | distretto |
| `ZoneAdmin` | responsabile per la zona | CD o RD |
| `ZoneAdmin` con `isPrimary` | responsabile «(principale)» | CD |
| `Venue` | sede (sede ufficiale, sede di gara) | la scuola nelle gare scolastiche; il distretto nelle gare distrettuali |
| `Venue` con `parentVenue` | sottosede | — |
| `VenueAdmin` | responsabile per la sede; «referenti di zona» nelle email di massa | — |
| referente della scuola | referente scolastico | RI (referente di istituto) |
| `ParticipantType.qualified` | selezionati per la prossima fase | segnalati, convocati |
| amministratore dell'olimpiade | amministratore | staff |

Attenzione a due ambiguità:

- nel linguaggio comune il CD non è considerato un RD («il CD e gli RD»),
  mentre in Olimanager è uno dei responsabili della zona, quello principale. In
  questo documento «RD» indica gli altri responsabili della zona;
- per la gara distrettuale lo stesso distretto corrisponde a due oggetti: la
  zona, che vale per tutta l'olimpiade e ha come responsabili CD e RD, e la
  sede della gara di quell'anno, che ha i propri responsabili e non
  necessariamente le stesse persone.

## Chi fa cosa

- **RI**: responsabile in Olimanager della sede della propria scuola; segnala
  gli studenti della scuola.
- **CD**: responsabile principale della zona (`isPrimary`; nel vecchio export
  dei distretti era la colonna `cd = 1`); decide i convocati del distretto.
- **RD**: gli altri responsabili della zona; aiutano il CD.
- **Staff e amministratori dell'olimpiade**: gestiscono scadenze, script e
  quote riservate.

Nei fogli distrettuali di Olifogli la regola è: il CD è responsabile del foglio
(`manager`), gli RD del distretto sono aiutanti (`editor`). Un aiutante può
inserire e modificare le righe, ma non cambiare nome, schema e permessi del
foglio né chiuderlo. In pratica ci sono eccezioni che devono restare possibili:

- in alcuni distretti un RD, o un altro collaboratore, sostituisce di fatto il
  CD ed è responsabile del foglio;
- a volte gli amministratori di Olifogli si aggiungono come responsabili di un
  foglio per aiutare un CD.

Olifogli applica questa regola usando la zona, non la sede: responsabile è il
responsabile principale della zona, aiutanti gli altri, indipendentemente da chi
è responsabile della sede della gara in Olimanager (nel 2026 le sedi di
febbraio avevano da 1 a 4 responsabili). Chi sostituisce il CD va aggiunto a
mano nell'anteprima. Le eccezioni sono salvaguardate: sui fogli esistenti le
modifiche ai permessi partono deselezionate e quelle non scelte vengono
conservate.

## Come è realizzato in Olimanager

Descrizione del comportamento osservabile dall'API GraphQL, che è accessibile a
qualunque utente registrato; il codice sorgente di Olimanager è privato e qui
non viene descritto. I nomi dei campi sono quelli dello schema GraphQL (una
copia è `graphql_schema.graphql` nel repository `oliquery`).

- **Segnalazioni e convocazioni** passano tutte dal campo
  `ParticipantType.qualified` («qualificato per la gara successiva»), impostato
  con la mutation `participants.updateResult(participantId, qualified)`. Nella
  tabella dei risultati di una venue è l'interruttore approva/rifiuta
  («selezionati per la prossima fase»). Possono impostarlo l'RI sulla propria
  scuola, l'RD sulle scuole del distretto e gli amministratori dell'olimpiade.
  L'API non dice chi ha impostato il campo né chi ha creato un partecipante.
- **Aggiunte dei CD senza fasi precedenti**: **dubbio** sul meccanismo;
  probabilmente il CD crea il partecipante direttamente nella venue
  distrettuale.
- **Scadenze**: non sono date registrate; lo staff apre e chiude le modifiche.
  Gli strumenti disponibili sono lo stato del contest (`ContestType.state`:
  `DRAFT`, `SCHEDULED`, `PUBLIC`, `FROZEN`, `FINALIZED`),
  `ContestType.allowResultUpload` (se gli amministratori delle venue possono
  caricare risultati) e `VenueAdminType.readOnly` (amministratore in sola
  lettura; il valore è visibile solo agli amministratori). **Dubbio**: la fase in
  cui possono modificare solo i CD si realizza probabilmente con lo stato del
  contest, ma non è confermato.
- **Quote**: ogni venue può avere un numero massimo di qualificati
  (`VenueType.quota`; le sottosedi usano quella della venue principale). Il
  limite vale per RI e RD; gli amministratori dell'olimpiade possono superarlo,
  ed è così che vengono assegnati i posti riservati. Il campo va usato e serve
  in particolare per le segnalazioni alla finale. Nel 2026 le venue dei contest
  31, 32 e 33 non avevano quote; **dubbio**: non è stato verificato se le avesse
  la gara distrettuale (contest 27).
- **Passaggio alla gara successiva**: lo script dello staff crea un partecipante
  nella gara nuova per ogni qualificato della precedente, nella venue che
  contiene la sua scuola. Prima dello script la gara distrettuale non ha
  partecipanti.
- **Venue e distretti**: Olimanager non registra a quale distretto appartiene
  una venue. Le venue delle gare distrettuali hanno il nome della zone,
  eventualmente seguito da una parentesi («Distretto di Pisa (Gara delle
  Prime)»), e Olifogli le abbina così (`app/lib/olimanagerVenueNames.ts`).
- L'approvazione dei concorrenti all'iscrizione all'edizione (da parte del
  referente della scuola) è un'altra cosa e non riguarda le convocazioni.

## Come lo gestisce Olifogli

- **Fogli**: lo schema `distrettuale` è in `VENUE_SHEET_SCHEMAS`
  (`app/lib/olimanagerVenueSheetConfig.ts`) con `scope: 'ZONE'` e
  `source: 'venues'`: un foglio per venue, chiamato come il distretto, con i
  permessi descritti in [Chi fa cosa](#chi-fa-cosa). Risposte corrette e punti
  stanno nel raccoglitore.
- **Righe**: il lavoro del worker `import_participants`
  (`app/lib/olimanagerParticipantImport.ts`, vedi [worker.md](worker.md)) legge
  i partecipanti del contest e li assegna al foglio dello stesso schema e
  contest della loro venue.
  - L'anteprima è calcolata dal worker e salvata negli item del lavoro, che resta
    in `awaiting_confirmation`; dopo la conferma le righe vengono create senza
    rileggere Olimanager.
  - Si aggiunge una riga per ogni partecipante non ancora collegato
    (`olimanager.participantId` e `olimanager.contestId`); le righe esistenti
    non vengono mai modificate né cancellate. L'importazione si può quindi
    rilanciare dopo ogni lancio dello script dei convocati.
  - Vengono solo segnalati: i partecipanti senza foglio, quelli già collegati a
    una riga di un altro foglio dello stesso contest (cambio di distretto), le
    righe collegate a partecipanti non più presenti in Olimanager e le righe
    senza collegamento.
  - La lettura richiede un account staff o amministratore dell'olimpiade.
- Quando l'importazione avrà funzionato sulla gara 2027 si potranno eliminare
  `createSheets`, `Schema.row_to_sheet`, `ImportazionePartecipantiDistrettuale`,
  `Distretti` e `SheetsCreation.tsx`.

## Gara delle prime

Serve a far proseguire verso la fase nazionale gli studenti molto giovani (di
prima) anche con un punteggio più basso; i suoi qualificati possono essere
convocati alla gara distrettuale. Nel 2026 i 61 qualificati sono stati tutti
convocati.

Nel 2026 la gara delle prime **non ha usato Olimanager per le iscrizioni**: le
3.062 righe dei 52 fogli `gara_prime` sono state inserite a mano in Olifogli
dal 7 gennaio al 3 febbraio, e i 2.772 partecipanti del contest 33 sono stati
creati da Olifogli dopo la gara («Crea/abbina partecipanti»:
`participantCreatedOn` dal 31 gennaio al 5 febbraio). 237 righe hanno l'id di
un partecipante del contest 31, copiato dalla migrazione
`20260114000000-copy-participant-id-to-gara-prime`.

I fogli `gara_prime` si creano già da Olimanager (strategia `venues`). Se
iscrivere i partecipanti in Olimanager prima della gara è **ancora da
decidere**; in quel caso l'importazione potrebbe riempire anche questi fogli.

## Dati verificati (edizione `olimat26`)

Contest dell'edizione: 24 Test di ammissione Senior, 25 Stage Senior, 27 Gara
di Febbraio (`ZONE`), 31 Archimede Biennio (`SCHOOL`), 32 Archimede Triennio
(`SCHOOL`), 33 Gara delle Prime (`ZONE`), 39 Finale nazionale.

| Contest | Partecipanti | `qualified` | Qualificati presenti a febbraio |
|---|---|---|---|
| 31 Biennio | 65.365 | 3.699 | 3.531 |
| 32 Triennio | 61.342 | 5.020 | 4.813 |
| 33 Prime | 2.772 | 61 | 61 |
| 27 Febbraio | 11.127 (91 venue su 92) | 298 (per la finale) | — |

Dei 11.127 partecipanti di febbraio, 8.404 erano qualificati nei contest
precedenti, 2.521 vi avevano partecipato senza essere qualificati e 202 non
compaiono in nessuno dei tre. I 202 sono le aggiunte dei CD senza fasi
precedenti; i 2.521 sono convocazioni dei CD o modifiche successive alle
segnalazioni, e alcuni potrebbero essere partecipanti creati da Olifogli dopo la
gara. Per l'importazione conta l'elenco finale del contest.

Altre caratteristiche dei partecipanti del contest 27:

- sede ufficiale e sede di gara coincidono sempre; ogni concorrente ha un solo
  componente; la scuola è sempre presente;
- `birthDate` nel formato `AAAA-MM-GG`; `classYear` da 9 a 13 (convertito in
  1–5);
- campo aggiuntivo 73 «Taglia maglietta» con valori `S`, `M`, `L`, `XL` o vuoto
  (i campi 71 e 72 contengono i punteggi di Archimede);
- 92 venue, tutte abbinate a una delle 92 zone dell'olimpiade `olimat`, con da 1
  a 4 amministratori; nessuna sottosede. C'è anche la venue «Distretti Esteri».

## Il vecchio flusso di Olifogli

- Un foglio `distretti` (export degli RD: `distretto`, `id_distretto`, `cd`,
  `nome`, `cognome`, `email`, …) con `Distretti.row_to_sheet` creava i fogli
  `distrettuale`: il CD (`cd = 1`) responsabile, gli altri RD aiutanti; nei dati
  del foglio `_id_distretto` e `_referente`.
- Un foglio `importazione_partecipanti_distrettuale` (export CSV dei
  partecipanti, colonne come «Sede di partecipazione», «ID partecipante») con
  `ImportazionePartecipantiDistrettuale.row_to_sheet` creava le righe: nome del
  foglio = distretto senza «Distretto di »; dati `surname`, `name`,
  `birthDate`, `codice_meccanografico`, `nome_scuola`, `città_scuola`,
  `classYear`, `classSection`, `shirt_size`; `olimanager.participantId`;
  righe già presenti saltate per cognome, nome e data di nascita.
- Lo script `participants.py` di `oliquery` produce colonne diverse, quindi il
  CSV del 2025 veniva probabilmente dall'export dell'interfaccia di Olimanager.

## Interrogare Olimanager

Query verificate sull'API di produzione (`participants` accetta al massimo
`first: 100`):

```graphql
query($after: String) { participants { participants(contestId: 27, first: 100, after: $after) {
  totalCount pageInfo { hasNextPage endCursor }
  edges { node { pk qualified officialVenue { id name } competingVenue { id }
    competitor { pk school { externalId name location { city { name } } }
      members { name surname birthDate classYear section } }
    extraFieldEntries { field { id fieldName } value } } } } } }

query { venues { venues(filters: {contest: {id: 27}}) {
  id name quota parentVenue { id } admins { user { email } } } } }

query { zones { zones(filters: {olympiad: {id: {exact: "olimat"}}}) {
  id name provinces { id } extraSchools { pk } admins { user { email } isPrimary } } } }
```

Attenzione alla sintassi: il filtro delle venue è `contest: {id: 27}` (senza
`exact`); `ZoneAdminType` non ha `name` e `VenueAdminType` non ha `id`. Leggere
tutti i partecipanti del contest 27 richiede circa 112 richieste in sequenza.

Per verifiche manuali si possono usare gli script del repository `oliquery`
(classe `Api` di `api.py`, login con le credenziali del file `.env`). Usare solo
query: il login è l'unica mutation ammessa; non chiamare `updateResult` o altre
mutation sui dati di produzione.

## Riepilogo dei dubbi

- Come i CD aggiungono gli studenti senza fasi precedenti.
- Come viene realizzata la fase in cui modificano solo i CD (probabilmente con
  lo stato del contest).
- Se la gara distrettuale ha le quote impostate per le segnalazioni alla finale.
- Se la gara delle prime iscriverà i partecipanti in Olimanager prima della
  gara.
