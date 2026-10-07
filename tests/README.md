# Test automatici

Eseguire dalla radice del repository, con le dipendenze di sviluppo installate:

```sh
npm test
```

Si usa il test runner integrato in Node.js (Node 20 o successivo), senza nuove
dipendenze. TypeScript, già presente nel progetto, traspila il server per il test.
Non sono necessari `.env`, credenziali, MongoDB, Redis o porte di rete.

La suite verifica i callback reali del server WebSocket usando cookie cifrati
generati da NextAuth: sessioni valide (anche HTTPS e cookie suddivisi in chunk),
sessioni scadute o alterate, segreti errati e tentativi di impersonificazione.
Verifica inoltre il rifiuto di query e mutation, il controllo della sessione a
ogni nuova operazione e la ricezione di un evento da una subscription autorizzata.
Database, rete e resolver applicativi sono isolati: l'evento usa un resolver di
prova e non sostituisce un collaudo con MongoDB e Redis.

In ambienti isolati che non consentono al runner di gestire correttamente i
processi figli, con Node 22.8 o successivo si può usare:

```sh
node --test --experimental-test-isolation=none tests/*.test.cjs
```
