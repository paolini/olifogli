import { MongoClient } from 'mongodb';

const uri: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli'
const options: object = {};
// Opzioni per il client MongoDB
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
        console.log("connecting to MongoDB... (development)")
        const client = new MongoClient(uri, options)
        global._mongoClientPromise = client.connect()
        global._mongoClientPromise.then((client) => {
            console.log("MongoDB connected successfully")
            main(client)
        })
    }
    clientPromise = global._mongoClientPromise
} else {
    console.log("connecting to MongoDB... (production)")
    const client = new MongoClient(uri, options)
    clientPromise = client.connect()
    clientPromise.then((client) => {
        console.log("MongoDB connected successfully")
        main(client)
    })
}

export async function getDb() {
    const client = await clientPromise
    return client.db()
}

export default clientPromise;

async function main(client: MongoClient) {
    console.log(
        "\n" +
        "      _ _  __           _    \n" +
        "  ___| (_)/ _|___  __ _| (_) \n" +
        " / _ \\ | |  _/ _ \\/ _` | | | \n" +
        " \\___/_|_|_| \\___/\\__, |_|_| \n" +
        "                  |___/      \n" +
        "\n");
    console.log(Date())
    const admin_emails = (process.env.ADMIN_EMAILS || "").split(",").map(u => u.trim()).filter(u => u.length > 0)
    const db = client.db()
    const users = db.collection("users")
    await users.updateMany(
        { email: { $in: admin_emails } },
        { $set: { is_admin: true } }
      );    
    const adminExists = await users.findOne({ is_admin: true })
    if (!adminExists) {
        const userExists = await users.findOne()
        if (!userExists) console.log("No users found in the database. Login to create one.")
        else console.log("No admin users found in the database. Set ADMIN_EMAILS in environment variables to create one.")
    }
}

