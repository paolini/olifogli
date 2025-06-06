#!/bin/sh
# Applica le migrazioni e avvia il server
set -e
npm run migrate:up
exec node server.js -H 0.0.0.0
