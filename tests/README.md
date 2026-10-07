# Test automatici

Eseguire dalla radice del repository, con le dipendenze di sviluppo installate:

```sh
npm test
```

Si usa il test runner integrato in Node.js (Node 20 o successivo), senza nuove
dipendenze. TypeScript, già presente nel progetto, traspila il server per il test.
Non sono necessari `.env`, credenziali, MongoDB, Redis o porte di rete.

In ambienti isolati che non consentono al runner di gestire correttamente i
processi figli, con Node 22.8 o successivo si può usare:

```sh
node --test --experimental-test-isolation=none tests/*.test.cjs
```

