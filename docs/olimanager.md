# Integrazione con Olimanager

Olimanager (https://olimpiadi-scientifiche.it) è il sistema delle Olimpiadi
Scientifiche. Olifogli lo usa per tre cose:

- **login** degli utenti tramite OAuth2/OIDC;
- **creazione dei fogli** a partire dalle iscrizioni delle scuole;
- **trasferimento dei dati**: abbinamento dei partecipanti, invio dei risultati
  ed extra fields. I trasferimenti in background sono descritti in
  [worker.md](worker.md).

Tutte le richieste GraphQL verso Olimanager usano `OLIMANAGER_GRAPHQL_ENDPOINT`,
che sostituisce il precedente nome `OLI_GRAPHQL_ENDPOINT`.

## Login OAuth

Olifogli si autentica sul provider OAuth2/OIDC di Olimanager tramite NextAuth,
con il flusso authorization code e PKCE. Gli endpoint (authorize, token,
userinfo, discovery) sono esposti dal backend Django di Olimanager, non dal suo
frontend Next.js.

- **Olimanager di staging o di produzione**: `OLIMANAGER_URL` è il dominio
  pubblico (per esempio `https://staging.olimpiadi-scientifiche.it`); il proxy
  instrada internamente verso Django. È la configurazione normale per sviluppare
  Olifogli.
- **Olimanager in locale**: frontend Next.js e backend Django girano come due
  servizi, di solito sulle porte 3000 e 8000. `OLIMANAGER_URL` deve puntare al
  backend (`http://localhost:8000`). Poiché il frontend di Olimanager occupa la
  porta 3000, Olifogli va avviato su un'altra porta, per esempio
  `npm run dev -- -p 3001`, con `NEXTAUTH_URL=http://localhost:3001` e callback
  `http://localhost:3001/api/auth/callback/olimanager`.

L'URI di callback è sempre `<NEXTAUTH_URL>/api/auth/callback/olimanager`.

Il logout (`signOut({ callbackUrl: '/' })`) riporta sempre alla home, perché la
pagina corrente può richiedere il login.

Tutte le pagine tranne la home richiedono il login, e passano da `Page`
(`app/components/Page.tsx`): senza sessione, per esempio aprendo un link
ricevuto o se la sessione scade, la pagina non viene montata e al suo posto
compare il modulo di login (`LoginForm`), che dopo il login riporta alla stessa
pagina (`callbackUrl`). Le pagine che leggono Olimanager (`requireApiScope`)
richiedono anche un token valido con lo scope `api` (`olimanagerApiReady`): se
lo scope manca o il token è scaduto, un pulsante fa logout e di nuovo login con
lo scope, tornando alla stessa pagina. Lo scope si sceglie infatti solo al
login.

### Applicazione OAuth

In Django deve esistere un'applicazione OAuth2
(`/admin/oauth2_provider/application/`) con:

- `client_type`: Confidential
- `authorization_grant_type`: Authorization code
- `redirect_uris`: l'URI di callback indicato sopra
- `algorithm`: RSA with SHA-2 256 (RS256). È obbligatorio quando si richiede
  lo scope `openid`: se manca, l'endpoint token risponde 500
  (`ImproperlyConfigured: This application does not support signed tokens`).
  Richiede anche `OAUTH2_PROVIDER["OIDC_RSA_PRIVATE_KEY"]` nelle impostazioni
  Django di quell'ambiente.

Il client secret in chiaro viene mostrato una sola volta, subito dopo la
creazione: va copiato in `OLIMANAGER_OAUTH_CLIENT_SECRET`.

Lo script di setup crea e verifica l'applicazione automaticamente:

```sh
npm run olimanager:setup -- --oauth-only            # verifica, senza modifiche
npm run olimanager:setup -- --oauth-only --apply    # crea l'applicazione se manca
```

L'applicazione creata si chiama **Olifogli locale**: Confidential, flusso
Authorization code, firma OIDC RS256, consenso esplicito e client secret salvato
come hash su Olimanager. Il callback predefinito è
`http://localhost:3000/api/auth/callback/olimanager`; per altri client o
istanze sono disponibili `--oauth-name` e `--oauth-redirect-uri`.

Le credenziali vengono stampate nell'output e vanno copiate a mano in `.env`:
lo script non crea file di credenziali e non modifica `.env`. Confronta client
ID, secret, URL di Olimanager, `OLIMANAGER_GRAPHQL_ENDPOINT` e `NEXTAUTH_URL`
con `.env` e con l'ambiente, e stampa solo le assegnazioni da correggere. Il
secret locale viene verificato contro l'hash PBKDF2 conservato da Django. Dopo
aver copiato le righe occorre riavviare Olifogli.

Se il secret è perso o non valido, lo si sostituisce mantenendo lo stesso
client ID:

```bash
npm run olimanager:setup -- --oauth-only --oauth-regenerate-secret --apply
```

Il secret precedente viene invalidato; senza `--apply` viene mostrata solo
l'anteprima. I rilanci normali non cambiano le credenziali esistenti. Dopo un
reset del database di Olimanager, le credenziali del `.env` vengono riutilizzate
se URL di Olimanager e `NEXTAUTH_URL` corrispondono. Se una richiesta fallisce
dopo l'invio, lo script stampa le credenziali proposte: conservare l'output e
verificarle con un rilancio normale dopo averle copiate in `.env`.

### Scope `api` per i trasferimenti

Il login richiede normalmente solo `openid email profile`. Per trasferire dati
verso Olimanager (e per la sezione Olimanager) si usa il pulsante
«LOGIN + OLIMANAGER», più piccolo, accanto a LOGIN: quel login richiede anche
lo scope `api`, senza assegnare ulteriori ruoli. Per cambiare la
scelta di una sessione già aperta occorre uscire e rifare il login.

Abbinamenti, risultati ed extra fields usano il token OAuth della sessione
dell'amministratore, letto solo sul server: il browser non richiede né invia
username o password. Restano necessari i privilegi amministrativi locali e i
permessi richiesti da Olimanager per ciascuna operazione.

La sessione pubblica espone solo `olimanagerApiScope` (true/false, oppure null
per sessioni non verificabili) e `olimanagerApiReady` (token presente, con lo
scope `api` e non scaduto, con gli stessi controlli del server), senza il token
né la sua scadenza. I comandi di trasferimento
restano visibili: scope e scadenza vengono controllati sul server quando si
tenta un trasferimento, prima di elaborare le righe o contattare Olimanager. Se
il controllo fallisce compare il messaggio con le istruzioni per rifare il login.

I fogli devono essere finalizzati (`locked`) dall'amministratore prima di
abbinamenti, invio risultati o aggiornamento degli extra fields: la sola
chiusura (`closed`) da parte dell'insegnante non basta.

## Creazione dei fogli Archimede

### Terminologia

In Olimanager una **venue** è la sede di un singolo contest: normalmente una
scuola per le gare scolastiche e una sede distrettuale per le fasi locali. Una
**zone** è il distretto territoriale dell'olimpiade. Il codice usa quindi il
nome `VenueSheets`, con le operazioni GraphQL `olimanagerVenueSheetChoices` e
`prepareOlimanagerVenueSheets`.

Ogni foglio è associato a un contest Olimanager tramite
`olimanager_contest_id` nel `commonData` del foglio. Da questo valore
(`context.contest_id` di `Schema.validationContext`) dipendono abbinamento e
creazione dei partecipanti, verifica, trasferimento dei risultati e
aggiornamento delle taglie; un foglio senza contest non può essere sincronizzato.
Un raccoglitore può quindi contenere fogli di contest diversi, come Biennio e
Triennio di Archimede.

Ogni esecuzione della creazione riguarda un solo schema e un solo contest.
`VENUE_SHEET_SCHEMAS` indica per ogni schema gestito l'ambito del contest e da
dove si ricavano le sedi:

| Schema | Contest | Sedi | Nome del foglio |
|---|---|---|---|
| `archimede_biennio`, `archimede_triennio` | `SCHOOL` | scuole con iscrizione valida all'edizione | codice meccanografico |
| `gara_prime`, `distrettuale` | `ZONE` | venue di primo livello del contest (le sottosedi sono ignorate) | nome del distretto |

Per Archimede la procedura si esegue due volte, una per categoria. Per i fogli
creati dalle venue le righe si importano poi con **Importa partecipanti da
Olimanager** (vedi [Importazione dei partecipanti](#importazione-dei-partecipanti)).
Per le altre gare (Senior, ecc.) andranno aggiunti gli schemi; fino ad
allora restano i metodi di importazione precedenti, che non assegnano il
contest ai fogli: va impostato a mano nei dati del foglio.

### Uso

Nella linguetta **Fogli** di un raccoglitore, gli amministratori globali possono
usare **Crea fogli da Olimanager**. Si selezionano olimpiade, edizione, schema e
il contest da associare ai fogli; sono proposti solo i contest dell'ambito
dello schema e, scegliendo lo schema, il contest già assegnato ai suoi fogli, se
è uno solo. **Carica anteprima** legge da Olimanager le sedi (scuole iscritte o
venue del contest).
Serve una sessione OAuth con scope `api` e permessi di lettura sulle iscrizioni
dell'edizione e sui responsabili dei distretti. Non occorre importare il foglio
«scuole e referenti».

Olimpiade ed edizione vengono salvate in `commonData` del workbook
(`olimanager_olympiad_id`, `olimanager_edition_id`), conservando gli altri
campi, e sono riproposte alla riapertura. Il contest viene salvato solo nei
fogli.

Fino alla versione 1.12 il contest era nel workbook
(`olimanager_<schema>_contest_id` e `olimanager_contest_id`): la migrazione
`20261116000000-move-contest-id-to-sheets` lo copia nei fogli esistenti e
rimuove quelle chiavi.

### Permessi proposti

Per le scuole iscritte l'anteprima assegna al referente dell'iscrizione il ruolo
di responsabile del foglio (`manager`) e a tutti i responsabili di distretto
(RD) il ruolo di osservatore (`viewer`). L'associazione al distretto usa
province ed eccezioni territoriali di Olimanager, anche per edizioni precedenti
all'ultima.

Per le venue l'anteprima assegna agli amministratori della venue il ruolo di
responsabile (`manager`) e agli RD del suo distretto quello di aiutante
(`editor`). Olimanager non registra il distretto di una venue: viene ricavato
dal nome, che è quello del distretto eventualmente seguito da una parentesi
(«Distretto di Pisa (Gara delle Prime)»).

I fogli possono essere creati anche senza responsabili, aiutanti o osservatori.
Referente o amministratore mancante, distretto assente o ambiguo e RD mancanti
producono avvisi; vengono assegnati solo i permessi ricavabili senza
ambiguità.

### Anteprima e applicazione

L'anteprima distingue nuovi fogli, fogli invariati, fogli da aggiornare e
conflitti. I fogli esistenti sono cercati per schema e nome/codice
meccanografico (`venueSheetPlan`):

- un foglio dello stesso contest è il foglio della sede;
- in sua assenza, un foglio senza contest viene proposto per l'associazione al
  contest scelto («associa al contest», da selezionare come i permessi);
- un foglio associato a un altro contest è un conflitto e non viene creato un
  duplicato.

Mostra permessi attuali e proposti, accessi aggiunti e rimossi e cambi di ruolo.
L'anteprima non propone cancellazioni di fogli. «Nascondi righe invariate»
toglie dalla tabella i fogli invariati, per vedere solo quelli da creare,
aggiornare o in conflitto.

Solo i nuovi fogli sono preselezionati: per i fogli esistenti ciascuna aggiunta,
rimozione e modifica di ruolo ha una propria casella, inizialmente
deselezionata. Si applicano solo le modifiche scelte; gli altri accessi e ruoli
vengono conservati. Per esempio si può aggiungere il nuovo referente e revocare
il precedente lasciando deselezionata la rimozione degli aiutanti aggiunti a
mano. La casella del foglio seleziona tutte le sue modifiche; quella generale
seleziona tutte le creazioni e tutte le modifiche, comprese le rimozioni. Una
selezione parziale è indicata sulla casella del foglio.

Righe e altri metadati dei fogli esistenti restano invariati. Prima delle
scritture i fogli vengono riletti: se permessi o contest sono cambiati dopo
l'anteprima occorre ricaricarla. I fogli con corrispondenze duplicate sono segnalati e non
selezionabili.

## Sezione Olimanager e rubrica di CD, RD e RI

Dopo «Competizioni» la home mostra la sezione «Olimanager». Se Olimanager si
può leggere (`session.olimanagerApiReady`) contiene la tabella delle olimpiadi
(query `olimanagerOlympiads`, aperta a ogni utente autenticato); altrimenti
spiega che bisogna fare il login abilitando i trasferimenti, o rifarlo se il
token è scaduto, con il pulsante «Rientra con lo scope api». Le
pagine seguono i livelli:

- `/olimanager/<olimpiade>`: le edizioni dell'olimpiade, dalla più recente;
- `/olimanager/<olimpiade>/<edizione>`: la rubrica dell'edizione, con l'elenco
  dei distretti;
- `/olimanager/<olimpiade>/<edizione>/<distretto>`: il dettaglio di un
  distretto (id della zona, `none` per «Senza distretto»).

Il titolo è nella barra di intestazione, come per raccoglitori e fogli:
«olimat 〉 2026 〉 Roma». L'olimpiade è indicata con il suo id, breve e
mnemonico (il nome completo compare al passaggio del mouse: le breadcrumb
accettano per questo un campo `title` facoltativo), l'edizione solo con l'anno
(il sito tratta solo le olimpiadi di matematica). Ogni voce porta al suo
livello. La rubrica sta nel layout dell'edizione
(`app/olimanager/[olympiadId]/[editionId]/layout.tsx`), così dati caricati e
filtri si conservano passando dall'elenco a un distretto e ritorno; tornando
all'edizione in seguito i dati in cache compaiono subito e vengono aggiornati.

La rubrica mostra chi gestisce la gara sul territorio, distretto per distretto:

- **CD**, coordinatori distrettuali: amministratori della zona con `isPrimary`;
- **RD**, responsabili di distretto: gli altri amministratori della zona;
- **RI**, referenti di istituto: referente (`contact`) di ogni iscrizione valida
  dell'edizione, con codice meccanografico, nome e città della scuola.

Le scuole sono assegnate ai distretti come nella creazione dei fogli (province
ed eccezioni territoriali); quelle senza distretto o con più distretti finiscono
in «Senza distretto». Distretti senza CD, referenti senza email e scuole non
assegnate producono avvisi.

I dati sono letti al momento da Olimanager (query `olimanagerAddressBook`,
`app/lib/olimanagerAddressBook.ts`) con la sessione OAuth dell'utente, che deve
avere lo scope `api`; non vengono salvati in Olifogli. Ogni consultazione
registra l'evento `olimanager.address_book_viewed` nei log applicativi.

### Cosa vede ciascun utente

Olifogli non applica permessi propri sui contatti: ognuno vede ciò che
Olimanager gli mostra. Per i dati che l'utente non può leggere Olimanager
restituisce elenchi vuoti, non errori (`fail_silently` dei permessi di
`strawberry_django`):

- l'elenco dei distretti è pubblico;
- CD e RD di un distretto (`Zone.admins`, `ZoneReadPermission`) sono visibili
  agli amministratori del distretto e dell'olimpiade;
- le iscrizioni dell'edizione (`OlympiadEdition.subscriptions`) sono visibili
  solo agli amministratori dell'edizione. Se non ne arriva nessuna, la rubrica
  legge le iscrizioni dei distretti di cui l'utente è RD (`Zone.subscriptions`);
  Olimanager le limita però all'ultima edizione, quindi per le edizioni
  precedenti gli RD non vedono gli RI e compare l'avviso
  `CURRENT_EDITION_ONLY`.

Per chi non è amministratore di Olifogli la rubrica nasconde i distretti in cui
non vede nulla; se non resta niente compare «Olimanager non ti mostra nessun
contatto per questa edizione».

I fogli invece vengono da Olifogli: amministratori e supervisori vedono tutti
quelli dell'edizione, gli altri solo quelli su cui hanno un permesso
(`permissions.email`, come nell'elenco fogli). «nessun foglio» accanto a una
scuola compare solo per amministratori e supervisori, perché per gli altri
l'assenza può dipendere dai permessi.

### Distretti e dettaglio

L'elenco dei distretti è una tabella: CD, numero di RD, scuole iscritte, scuole con almeno un foglio, righe
valide/righe dei fogli del distretto e delle sue scuole, numero di avvisi e,
nell'ultima colonna, i link ai fogli distrettuali. Il nome porta al dettaglio
del distretto, con CD, RD, la tabella delle scuole con i loro RI e fogli e gli
avvisi del distretto. Chi vede un solo distretto entra direttamente nel
dettaglio.

Nell'elenco ci sono due ricerche distinte:

- «Filtra distretti» guarda solo il nome del distretto;
- «Cerca persone o scuole» guarda nome, email, scuola, codice e città, ma non il
  nome del distretto (cercando «Roma» si trovano le persone e le scuole di
  Roma, non il distretto); quando è compilata sostituisce la tabella dei
  distretti con l'elenco dei risultati (al più 200 mostrati), ciascuno con il
  link al suo distretto.

Le caselle CD/RD/RI valgono per entrambe. «Copia email» e «Scarica CSV»
agiscono sui risultati della ricerca di persone o, senza ricerca, sui ruoli
scelti dei distretti elencati: con il solo CD e nessun filtro si ottengono le
email di tutti i CD. Nel dettaglio di un distretto c'è una sola ricerca, e le
stesse azioni valgono per le voci mostrate. Ruoli e filtri dell'elenco si
conservano entrando in un distretto e tornando indietro.

Gli avvisi (CD mancante, referenti senza email, scuole non assegnate) sono
legati al distretto (`warnings` di `OlimanagerAddressBookDistrict`); restano
generali solo quelli non legati a un distretto, come `CURRENT_EDITION_ONLY`.

### Fogli ed esportazione

Una versione di sviluppo della rubrica, mai rilasciata, ricordava l'ultima
edizione di ogni utente: la migrazione
`20261122000000-remove-address-book-selection` rimuove il campo
`addressBookSelection` dai database in cui è stata usata.

Accanto a ogni scuola ci sono i link ai suoi fogli dei contest scolastici
dell'edizione (`commonData.Codice_meccanografico`), e accanto al distretto
quelli dei contest distrettuali (`commonData.Distretto`); in mancanza di queste
chiavi vale il nome del foglio, come per i fogli `distrettuale` del vecchio
flusso che hanno il distretto solo nel nome. Per ogni foglio sono indicate
righe valide/righe e stato (aperto, chiuso, finalizzato, con le stesse icone
dell'elenco fogli). Contano solo i fogli il cui `olimanager_contest_id` è un
contest dell'edizione: i fogli di altre edizioni o senza contest non
compaiono. Le scuole senza fogli sono segnalate con «nessun foglio»; se
l'edizione non ha alcun foglio compare un solo avviso.

Il CSV (`rubrica.csv`) ha una riga per persona e ruolo, con i tipi di foglio
della scuola nella colonna `fogli`. I numeri di telefono non sono disponibili:
Olimanager non li espone agli amministratori dell'olimpiade.

## Importazione dei partecipanti

Per i fogli creati dalle venue di un contest `ZONE` (schemi `distrettuale` e
`gara_prime`, `isParticipantImportSchema`) le righe si creano dai partecipanti
del contest. È il passo successivo allo script dello staff che crea i
partecipanti della gara distrettuale (vedi
[piano-gara-distrettuale.md](piano-gara-distrettuale.md)).

Nella linguetta **Fogli** gli amministratori usano **Importa partecipanti da
Olimanager**, scelgono schema e contest tra quelli dei fogli del raccoglitore e
premono **Leggi i partecipanti da Olimanager**. L'operazione è un lavoro del
worker (`import_participants`, vedi [worker.md](worker.md)) in due fasi:

1. **Anteprima.** Con il token OAuth delegato il worker legge contest, distretti,
   venue e tutti i partecipanti (pagine da 100, `fetchContestParticipants`).
   Richiede che l'account sia staff o amministratore dell'olimpiade, perché un
   elenco parziale sembrerebbe completo. Ogni partecipante va nel foglio con il
   nome del distretto della sua sede ufficiale, ricavato come nella creazione
   dei fogli (`venueSheetNames`, le sottosedi seguono la venue principale). Le
   righe da creare sono salvate negli item del lavoro e il lavoro passa a
   `awaiting_confirmation`: il token viene eliminato e i fogli non restano
   riservati. La pagina mostra per foglio righe presenti, righe nuove e l'elenco
   dei nuovi partecipanti, più le segnalazioni.
2. **Creazione.** **Importa N righe** (`confirmOlimanagerImport`) riserva di
   nuovo i fogli e accoda la creazione, che non contatta Olimanager. Ogni riga
   è validata con lo schema del foglio e inserita con `olimanager.participantId`
   e `olimanager.contestId`, insieme ai contatori del foglio, nella stessa
   transazione. **Annulla l'importazione** (`cancelOlimanagerImport`) scarta
   l'anteprima.

Dati della riga (`participantRowData`), come la vecchia
`ImportazionePartecipantiDistrettuale`: cognome, nome, data di nascita,
codice meccanografico, nome e città della scuola, anno di corso (`classYear`
9–13 diventa 1–5), sezione e taglia (campo aggiuntivo il cui nome contiene
«taglia»). I campi che lo schema non ha sono scartati (la gara delle prime non
ha anno di corso né taglia).

L'importazione **non modifica né cancella** righe esistenti:

- un partecipante già collegato a una riga dei fogli del contest non viene
  aggiunto; se la riga è in un foglio di un altro distretto viene segnalato;
- i partecipanti di distretti senza foglio, di sedi non riconducibili a un
  distretto o con più componenti vengono segnalati e non importati;
- sono segnalate le righe collegate a partecipanti non più presenti nel contest
  e quelle senza collegamento (aggiunte a mano);
- alla creazione si saltano i partecipanti collegati a una riga dopo
  l'anteprima, e si rifiutano i fogli chiusi, finalizzati o il cui schema o
  contest è cambiato.

Rilanciando l'importazione si aggiungono solo i partecipanti nuovi; se non ce ne
sono il lavoro si conclude senza chiedere conferma.

## Dati di prova su staging

Lo script `npm run olimanager:setup` prepara su Olimanager una gara Archimede di
prova. Senza opzioni verifica la configurazione senza creare dati:

```sh
npm run olimanager:setup
```

Per creare gli oggetti mancanti e salvare ID e anagrafiche di prova:

```sh
npm run olimanager:setup -- --apply --output /tmp/olifogli-archimede.json
```

### Requisiti e destinazione

Lo script è JavaScript per Node.js e usa le dipendenze npm del progetto
(`dotenv` per `.env`, `parse5` per i moduli Django). Servono inoltre curl e un
account con accesso al pannello Django; non servono Python o pip.

Per impostazione predefinita usa lo staging e le sue credenziali pubbliche di
test: con username e password non impostati o vuoti usa l'account
`admin@olimanager.it`, con password uguale all'email. Un'altra istanza si
seleziona con `--url https://istanza.example` e `--username admin@example.it`,
impostando `OLIMANAGER_SETUP_PASSWORD` nell'ambiente. L'URL è quello di base,
senza `/graphql`. Sono disponibili anche `OLIMANAGER_SETUP_URL` e
`OLIMANAGER_SETUP_USERNAME`.

Lo script legge `.env` senza modificarlo (`dotenv` con `override: false`): le
variabili già esportate nell'ambiente hanno precedenza. Il server da modificare
resta lo staging salvo `--url` o `OLIMANAGER_SETUP_URL` espliciti:
`OLIMANAGER_URL` serve solo a confrontare la configurazione dell'app, non a
scegliere il server.

Si possono indicare `--year 2026`, `--student EMAIL` e `--teacher EMAIL`. Lo
studente deve avere un profilo delle superiori (anni scolastici 9–13); la sua
scuola e gli account vengono riutilizzati. Senza selezione esplicita, lo script
cerca gli account disponibili nel database.

### Cosa viene creato

La struttura comprende un'olimpiade di test, un'edizione, l'iscrizione della
scuola e due gare scolastiche: **Archimede Biennio** e **Archimede Triennio**.
Ogni gara ha una sede amministrata dal docente e 16 problemi, numerati da 1 a 16,
con punteggi ammessi da 0 a 5. Gli oggetti esistenti sono riutilizzati senza
aggiornarli o cancellarli; la procedura può riprendere dopo un'interruzione.

Lo studente con account viene iscritto alla gara appropriata. Per ciascuna gara
viene creato anche un concorrente senza account; un'ulteriore anagrafica è
inclusa solo nel manifest, per provare successivamente la creazione da Olifogli.
Non vengono inviati risultati né creati workbook. Il setup configura anche
l'applicazione OAuth (vedi [Applicazione OAuth](#applicazione-oauth)).

### Manifest

Il manifest JSON non contiene secret. Contiene `contests.biennio`,
`contests.triennio`, `workbookCommonData`, `sheetCommonData.biennio` e
`sheetCommonData.triennio` (con il codice meccanografico e
`olimanager_contest_id` del foglio) e le righe di prova, con `olifogliData`
pronto per i campi delle righe di Olifogli.

La configurazione usa permutazioni e chiavi di correzione sintetiche, non
corrispondenti a nessuna edizione reale, in `scripts/fixtures/archimede.json`
(la chiave `_comment` lo ricorda anche nel manifest): codice iniziale `2` per il
biennio, `3` per il triennio; risposta corretta 5, vuota 1, errata o non valida 0. L'anno e gli ID
vengono impostati durante il setup. `participantId` nel manifest identifica le
partecipazioni già predisposte; non viene importato automaticamente in Olifogli.
