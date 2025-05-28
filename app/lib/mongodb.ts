import { MongoClient } from 'mongodb';

const uri: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli';
const options: object = {};

let clientPromise: Promise<MongoClient>;

declare global {
    // Aggiungiamo un tipo globale per evitare errori multipli
    // durante lo sviluppo
    // eslint-disable-next-line no-var
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!uri) throw new Error("Please add your MongoDB URI to .env.local")

if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
        console.log("connecting to MongoDB... (development)");
        const client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
        main();
    }
    clientPromise = global._mongoClientPromise;
} else {
    console.log("connecting to MongoDB... (production)");
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
    main();
}

export async function getDb() {
    const client = await clientPromise;
    return client.db('olifogli');
}

export default clientPromise;

async function main() {
    console.log(
        "\n" +
        "      _ _  __           _    \n" +
        "  ___| (_)/ _|___  __ _| (_) \n" +
        " / _ \\ | |  _/ _ \\/ _` | | | \n" +
        " \\___/_|_|_| \\___/\\__, |_|_| \n" +
        "                  |___/      \n" +
        "\n");
    console.log(Date())
}

