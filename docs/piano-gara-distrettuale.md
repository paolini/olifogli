# Piano: fogli e partecipanti della gara distrettuale

Stato: **implementato** (novembre 2026), da provare sulla gara distrettuale
2027 prima di eliminare i metodi obsoleti (punto 4 della soluzione). Questo
documento raccoglie quanto verificato sul funzionamento di Olimanager e sui suoi
dati, in modo da non ripetere le ricerche. L'uso è descritto in
[olimanager.md](olimanager.md#importazione-dei-partecipanti).

Obiettivo: sostituire i metodi obsoleti (`createSheets` con
`ImportazionePartecipantiDistrettuale` e `Distretti`, vedi
[olimanager.md](olimanager.md) e `AGENTS.md`) creando da Olimanager sia i fogli
`distrettuale` sia le loro righe, cioè i partecipanti convocati.

## Il processo annuale

Riassunto del processo (edizione 2026), con il corrispondente in Olimanager:

| Passo | Cosa succede | In Olimanager |
|---|---|---|
| 1–3 | I Referenti di Istituto (RI) inseriscono anagrafiche e risposte di Archimede in Olifogli; a fine correzione i dati vengono trasferiti su Olimanager | partecipanti dei contest scolastici (`SCHOOL`) |
| 4a | Gli RI indicano i meritevoli per la gara distrettuale, entro una scadenza | `Participant.qualified` sui partecipanti di Archimede, nella venue della scuola |
| 4b | Si svolge la gara delle prime, gestita in Olifogli | vedi [Gara delle prime](#gara-delle-prime-2026) |
| 5 | Fino a una scadenza successiva i CD (gli RD principali, `isPrimary` delle zone) convocano i partecipanti: confermano o modificano le segnalazioni, aggiungono partecipanti dalla gara delle prime o arbitrari | `qualified` sulle scuole del distretto; probabilmente creazione diretta di partecipanti nella venue distrettuale |
| 6 | Uno script dello staff crea le liste dei convocati per distretto, da importare in Olifogli | partecipanti del contest distrettuale; **qui va usata la nuova importazione** |
| 7 | Dopo la gara i CD inseriscono risposte e valutazioni in Olifogli | fogli `distrettuale` |
| 8 | I dati vanno su Olimanager; i CD segnalano i candidati alla finale di Cesenatico | `qualified` sui partecipanti della gara distrettuale |
| 9 | Uno script dello staff crea la lista dei convocati alla finale | partecipanti del contest nazionale |

Gli studenti convocati alla gara distrettuale devono essere registrati su
Olimanager.

## Meccanismo delle qualificazioni in Olimanager

Descrizione del comportamento osservabile dall'API GraphQL, che è accessibile a
qualunque utente registrato; il codice sorgente di Olimanager è privato e qui
non viene descritto. I nomi dei campi sono quelli dello schema GraphQL (una
copia è `graphql_schema.graphql` nel repository `oliquery`).

- Non esiste un oggetto «segnalazione»: tutto passa dal campo
  `ParticipantType.qualified` («qualificato per la gara successiva»), che si
  imposta con la mutation `participants.updateResult(participantId, qualified)`.
  Nell'interfaccia di Olimanager è l'interruttore approva/rifiuta della tabella
  dei risultati di una venue («selezionati per la prossima fase»). L'API non
  dice chi ha impostato il campo né chi ha creato un partecipante.
- Possono impostarlo l'RI sui partecipanti della propria scuola, l'RD sui
  partecipanti delle scuole del suo distretto e gli amministratori
  dell'olimpiade. Le scadenze non sono date registrate: lo staff apre e chiude
  le modifiche con lo stato del contest (`ContestType.state`: `DRAFT`,
  `SCHEDULED`, `PUBLIC`, `FROZEN`, `FINALIZED`), con
  `ContestType.allowResultUpload` (se gli amministratori delle venue possono
  caricare risultati) e con `VenueAdminType.readOnly` (amministratore della
  venue in sola lettura; il valore è visibile solo agli amministratori).
  Ipotesi da confermare: la fase in cui possono modificare solo i CD si ottiene
  mettendo in sola lettura gli altri amministratori.
- **Quote**: ogni venue può avere un numero massimo di qualificati
  (`VenueType.quota`; le sottosedi usano quella della venue principale). Il limite
  vale per RI e RD; gli amministratori dell'olimpiade possono superarlo, per
  esempio per le quote nazionali riservate a chi è andato bene alla finale.
  Nel 2026 nessuna venue dei contest 31, 32 e 33 aveva una quota.
- **Passaggio alla gara successiva**: lo staff lancia uno script che crea un
  partecipante nella gara nuova per ogni qualificato della precedente, nella
  venue che contiene la sua scuola. I partecipanti della gara distrettuale
  esistono quindi solo dopo questo passaggio.
- **Venue e distretti**: Olimanager non registra a quale distretto appartiene
  una venue. Le venue delle gare distrettuali hanno il nome della zone,
  eventualmente seguito da una parentesi («Distretto di Pisa (Gara delle
  Prime)»); `sheetsFromVenues` (`app/lib/olimanagerVenueSheets.ts`) le abbina
  così.
- L'approvazione dei concorrenti all'iscrizione all'edizione (da parte del
  referente della scuola) è un'altra cosa e non riguarda le convocazioni.

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
compaiono in nessuno dei tre: sono le aggiunte dei CD (passo 5) e,
probabilmente, partecipanti creati da Olifogli dopo la gara («Crea/abbina
partecipanti»). Per l'importazione conta l'elenco finale del contest.

Altre caratteristiche dei partecipanti del contest 27:

- sede ufficiale e sede di gara coincidono sempre; ogni concorrente ha un solo
  componente; la scuola è sempre presente;
- `birthDate` nel formato `AAAA-MM-GG`; `classYear` da 9 a 13 (da convertire in
  1–5 come faceva `ImportazionePartecipantiDistrettuale.row_to_sheet`);
- campo aggiuntivo 73 «Taglia maglietta» con valori `S`, `M`, `L`, `XL` o vuoto
  (i campi 71 e 72 contengono i punteggi di Archimede);
- 92 venue, tutte abbinate a una delle 92 zone dell'olimpiade `olimat`, con da 1
  a 4 amministratori; nessuna sottosede. C'è anche la venue «Distretti Esteri».

### Gara delle prime 2026

La gara delle prime serve a far proseguire verso la fase nazionale gli studenti
molto giovani (di prima) anche con un punteggio più basso. Nel 2026 i suoi 61
qualificati sono tutti diventati partecipanti della gara di febbraio
(contest 27).

Nel 2026 la gara delle prime **non ha usato Olimanager per le iscrizioni**: le
3.062 righe dei 52 fogli `gara_prime` sono state inserite a mano in Olifogli
dal 7 gennaio al 3 febbraio, e i 2.772 partecipanti del contest 33 sono stati
creati da Olifogli («Crea/abbina partecipanti»: `participantCreatedOn` dal 31
gennaio al 5 febbraio, 2.308 il 3 febbraio). 237 righe hanno l'id di un
partecipante del contest 31, copiato dalla migrazione
`20260114000000-copy-participant-id-to-gara-prime`. Le 53 venue del contest 33
(una per distretto, una con amministratore ciascuna) coincidono con i 52 fogli
più Trieste. Per la gara delle prime la creazione dei fogli da Olimanager è già
implementata (schema `gara_prime`); importare le righe ha senso solo se in
futuro i partecipanti verranno creati in Olimanager prima della gara.

## Il vecchio flusso di Olifogli

- Un foglio `distretti` (export degli RD: `distretto`, `id_distretto`, `cd`,
  `nome`, `cognome`, `email`, …) con `Distretti.row_to_sheet` creava i fogli
  `distrettuale`: il CD (RD principale, `cd = 1`) responsabile, gli altri RD
  aiutanti; nei dati del foglio `_id_distretto` e `_referente`.
- Un foglio `importazione_partecipanti_distrettuale` (export CSV dei
  partecipanti, colonne come «Sede di partecipazione», «ID partecipante») con
  `ImportazionePartecipantiDistrettuale.row_to_sheet` creava le righe: nome del
  foglio = distretto senza «Distretto di »; dati `surname`, `name`,
  `birthDate`, `codice_meccanografico`, `nome_scuola`, `città_scuola`,
  `classYear`, `classSection`, `shirt_size`; `olimanager.participantId`;
  righe già presenti saltate per cognome, nome e data di nascita.
- Lo script `participants.py` di `oliquery` produce colonne diverse, quindi il
  CSV del 2025 veniva probabilmente dall'export dell'interfaccia di Olimanager.

## Soluzione decisa

I punti 1–3 sono implementati come descritto; differenze e scelte di dettaglio:

- l'anteprima è calcolata dal worker e salvata negli item del lavoro
  `import_participants`, che resta in `awaiting_confirmation`; la creazione
  delle righe, dopo la conferma, non rilegge Olimanager;
- un partecipante già collegato a una riga di un altro foglio dello stesso
  contest non viene aggiunto, ma segnalato (cambio di distretto);
- vengono segnalate anche le righe senza collegamento a Olimanager;
- la lettura richiede che l'account sia staff o amministratore dell'olimpiade.

1. **Fogli**: aggiungere `distrettuale` a `VENUE_SHEET_SCHEMAS`
   (`app/lib/olimanagerVenueSheetConfig.ts`) con `scope: 'ZONE'` e
   `source: 'venues'`, come `gara_prime`: un foglio per venue, nome = distretto,
   amministratori della venue responsabili (`manager`), RD del distretto aiutanti
   (`editor`). Verificare prima che lo schema non richieda altri dati nel
   foglio (le risposte corrette `correct_answers` e i punti stanno nel
   raccoglitore).
2. **Righe**: nuova operazione «Importa partecipanti da Olimanager», separata e
   ripetibile, eseguita **nel worker** come gli altri lavori Olimanager
   (token delegato, avanzamento, vedi [worker.md](worker.md)):
   - legge i partecipanti del contest (vedi query sotto) e li assegna al foglio
     dello stesso schema e contest della loro venue (stesso abbinamento per nome
     del distretto);
   - aggiunge una riga per ogni partecipante il cui `participantId` non è già in
     quel foglio, con `olimanager.participantId` e `olimanager.contestId`;
   - **non modifica né cancella** righe esistenti; segnala i partecipanti senza
     foglio e le righe del foglio non più presenti in Olimanager;
   - mostra prima un'anteprima (righe nuove per foglio); aggiorna i contatori
     denormalizzati del foglio nella stessa transazione.
3. Il momento giusto è dopo lo script del passo 6; rilanciandola si aggiungono i
   convocati successivi.
4. Quando l'importazione funziona si possono eliminare `createSheets`,
   `Schema.row_to_sheet`, `ImportazionePartecipantiDistrettuale`, `Distretti` e
   `SheetsCreation.tsx`.

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
  id name parentVenue { id } admins { user { email } } } } }

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

## Questioni aperte

- Come i CD aggiungono o tolgono convocati rispetto alle segnalazioni degli RI
  (creazione diretta nella venue distrettuale o solo `qualified`), e come viene
  realizzata la fase in cui possono modificare solo i CD: da chiedere a chi
  gestisce Olimanager.
- Quando lo staff crea i partecipanti della gara distrettuale, per indicare
  quando eseguire l'importazione.
- Se le quote sono gestite fuori da Olimanager (nel 2026 non erano impostate).
- Se in futuro la gara delle prime avrà i partecipanti in Olimanager prima della
  gara, l'importazione potrà riempire anche i fogli `gara_prime`.
