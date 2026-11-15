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
verso Olimanager si seleziona «richiesta scope api» accanto a LOGIN: quel login
richiede anche lo scope `api`, senza assegnare ulteriori ruoli. Per cambiare la
scelta di una sessione già aperta occorre uscire e rifare il login.

Abbinamenti, risultati ed extra fields usano il token OAuth della sessione
dell'amministratore, letto solo sul server: il browser non richiede né invia
username o password. Restano necessari i privilegi amministrativi locali e i
permessi richiesti da Olimanager per ciascuna operazione.

La sessione pubblica espone solo `olimanagerApiScope` (true/false, oppure null
per sessioni non verificabili), senza il token. I comandi di trasferimento
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

Attualmente è gestito solo Archimede: le sedi corrispondono alle scuole iscritte
e ciascuna scuola ha un foglio Biennio e uno Triennio. I responsabili della zone
sono proposti come supervisori. L'associazione sede–scuola e la suddivisione
Biennio/Triennio sono specifiche di Archimede: per le altre gare (gara delle
prime, gara di febbraio, Senior, ecc.) l'anteprima andrà adattata ai rispettivi
contest, venue e permessi quando servirà.

### Uso

Nella linguetta **Fogli** di un raccoglitore, gli amministratori globali possono
usare **Crea fogli da Olimanager**. Si selezionano olimpiade, edizione e i due
contest scolastici da associare a Biennio e Triennio; **Salva configurazione e
carica anteprima** legge tutte le scuole con iscrizione valida a quella edizione.
Serve una sessione OAuth con scope `api` e permessi di lettura sulle iscrizioni
dell'edizione e sui responsabili dei distretti. Non occorre importare il foglio
«scuole e referenti».

La configurazione viene salvata in `commonData` del workbook, conservando gli
altri campi:

- `olimanager_olympiad_id`
- `olimanager_edition_id`
- `olimanager_archimede_biennio_contest_id`
- `olimanager_archimede_triennio_contest_id`

Le selezioni sono riproposte alla riapertura; per i workbook precedenti vengono
ricavate dai codici dei contest già configurati.

### Permessi proposti

L'anteprima assegna al referente dell'iscrizione il ruolo di amministratore e a
tutti i responsabili del distretto il ruolo di supervisore. L'associazione al
distretto usa province ed eccezioni territoriali di Olimanager, anche per
edizioni precedenti all'ultima. I fogli possono essere creati anche senza
amministratori o supervisori. Referente senza email, distretto assente o ambiguo
e responsabili mancanti producono avvisi; vengono assegnati solo i permessi
ricavabili senza ambiguità.

### Anteprima e applicazione

L'anteprima distingue nuovi fogli, fogli invariati e permessi da aggiornare; i
fogli esistenti sono riconosciuti da schema e nome/codice meccanografico.
Mostra permessi attuali e proposti, accessi aggiunti e rimossi e cambi di ruolo.

Solo i nuovi fogli sono preselezionati: per i fogli esistenti ciascuna aggiunta,
rimozione e modifica di ruolo ha una propria casella, inizialmente
deselezionata. Si applicano solo le modifiche scelte; gli altri accessi e ruoli
vengono conservati. Per esempio si può aggiungere il nuovo referente e revocare
il precedente lasciando deselezionata la rimozione degli aiutanti aggiunti a
mano. La casella del foglio seleziona tutte le sue modifiche; quella generale
seleziona tutte le creazioni e tutte le modifiche, comprese le rimozioni. Una
selezione parziale è indicata sulla casella del foglio.

Righe e altri metadati dei fogli esistenti restano invariati. Prima delle
scritture i fogli vengono riletti: se i permessi sono cambiati dopo l'anteprima
occorre ricaricarla. I fogli con corrispondenze duplicate sono segnalati e non
selezionabili.

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
`contests.triennio`, `workbookCommonData`, `sheetCommonData` e le righe di
prova, con `olifogliData` pronto per i campi delle righe di Olifogli.

La configurazione usa le permutazioni Archimede 2025 conservate in
`scripts/fixtures/archimede.json`: codice iniziale `2` per il biennio, `3` per il
triennio; risposta corretta 5, vuota 1, errata o non valida 0. L'anno e gli ID
vengono impostati durante il setup. `participantId` nel manifest identifica le
partecipazioni già predisposte; non viene importato automaticamente in Olifogli.
