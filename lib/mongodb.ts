import { MongoClient } from 'mongodb';

const uri: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli';
const options: object = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    // Aggiungiamo un tipo globale per evitare errori multipli
    // durante lo sviluppo
    // eslint-disable-next-line no-var
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

console.log(
    "      _ _  __           _    \n" +
    "  ___| (_)/ _|___  __ _| (_) \n" +
    " / _ \\ | |  _/ _ \\/ _` | | | \n" +
    " \\___/_|_|_| \\___/\\__, |_|_| \n" +
    "                  |___/      \n" +
    "\n");

if (!uri) {
    throw new Error("Please add your MongoDB URI to .env.local");
}

if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

export async function getDb() {
    const client = await clientPromise;
    return client.db('olifogli');
}

export default clientPromise;
