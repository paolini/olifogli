#!/usr/bin/env node
// Prepares MongoDB for `migrate-mongo up`:
// 1. waits until the database accepts writes (replica set primary reachable),
//    so migrations do not fail while the database container is starting;
// 2. makes the migrate-mongo lock atomic. migrate-mongo checks for a lock
//    document and then inserts one, so two processes starting together both
//    pass the check. A unique index on a field the lock documents never have
//    lets only one of them insert: the other fails with "Could not create a lock".
// Uses the same URL and database as migrate-mongo-config.js; prints no
// connection details.
const path = require('node:path')
const { MongoClient } = require('mongodb')
const config = require(path.resolve(__dirname, '..', 'migrate-mongo-config.js'))

const attempts = Number(process.env.MONGODB_WAIT_ATTEMPTS || 60)
const delayMs = 2000

async function waitForPrimary() {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new MongoClient(config.mongodb.url, { serverSelectionTimeoutMS: 2000 })
    try {
      await client.connect()
      const hello = await client.db(config.mongodb.databaseName).admin().command({ hello: 1 })
      if (hello.isWritablePrimary) return client
    } catch {
      // not ready yet
    }
    await client.close().catch(() => {})
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return null
}

async function main() {
  const client = await waitForPrimary()
  if (!client) {
    console.error('MongoDB non raggiungibile: migrazioni non eseguite')
    process.exit(1)
  }
  try {
    await client.db(config.mongodb.databaseName).collection(config.lockCollectionName)
      .createIndex({ singleton: 1 }, { unique: true, name: 'single_migration_lock' })
  } finally {
    await client.close()
  }
}

main().catch(() => {
  console.error('Preparazione delle migrazioni non riuscita')
  process.exit(1)
})
