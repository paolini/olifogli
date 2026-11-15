#!/bin/sh
# Avvia il server. Le migrazioni sono applicate qui solo se MIGRATE_ON_START
# non vale "0": nei Compose di produzione le applica una volta il servizio
# "migrate" (migrate.sh). Se più istanze migrano all'avvio, il lock reso
# atomico da prepare-migrations.cjs ne lascia passare una sola; le altre
# escono con errore e vengono riavviate da Docker.
set -e
if [ "${MIGRATE_ON_START:-1}" != "0" ]; then
  node scripts/prepare-migrations.cjs
  npm run migrate:up
fi
exec node server.js -H 0.0.0.0
