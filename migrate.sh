#!/bin/sh
# Applica le migrazioni pendenti una sola volta (servizio "migrate" dei Compose
# di produzione). Le istanze dell'app partono solo dopo la sua conclusione.
set -e
node scripts/prepare-migrations.cjs
exec npx migrate-mongo up
