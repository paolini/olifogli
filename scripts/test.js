// scripts/test.js
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined. Please set it in your environment file.");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

async function main() {
  try {
    await client.connect();
    const db = client.db();
    const workbooks = await db.collection('workbooks').find({}).toArray();
    console.log('Elenco workbooks:');
    console.log(workbooks);
  } catch (error) {
    console.error('Errore durante la connessione o la query:', error);
  } finally {
    await client.close();
  }
}

main();
