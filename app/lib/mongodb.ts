import { MongoClient, WithoutId, ClientSession } from 'mongodb'

import { Account, User, Sheet, Row, Workbook, ScanJob, ScanResults, ScanSheetJob, Setting } from './models'

const uri: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/olifogli'
const options: object = {};
// Opzioni per il client MongoDB
let clientPromise: Promise<MongoClient>;

declare global {
    // Aggiungiamo un tipo globale per evitare errori multipli
    // durante lo sviluppo
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
    const admin_emails = (process.env.ADMIN_EMAILS || "").split(",").map(u => u.trim()).filter(u => u.length > 0)
    const db = client.db()
    const users = db.collection("users")
    await users.updateMany(
        { email: { $in: admin_emails } },
        { $set: { isAdmin: true } }
      );    
    const admins = await users.find({ isAdmin: true }).toArray()
    if (admins.length > 0) {
        console.log("Admin users found in the database:")
        admins.forEach(u => console.log("* " + u.email))
    } else {
        const userExists = await users.findOne()
        if (!userExists) console.log("No users found in the database. Login to create one.")
        else console.log("No admin users found in the database. Set ADMIN_EMAILS in environment variables to create one.")
    }
}

export async function getAccountsCollection() {
    const db = await getDb();
    return db.collection<WithoutId<Account>>('accounts');
}

export async function getUsersCollection() {
    const db = await getDb()
    return db.collection<WithoutId<User>>('users')
}

export async function getSheetsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<Sheet>>('sheets')
}

export async function getRowsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<Row>>('rows')
}

export async function getWorkbooksCollection() {
    const db = await getDb()
    return db.collection<WithoutId<Workbook>>('workbooks')
}

export async function getScanJobsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<ScanJob>>('scan_jobs')
}

export async function getScanResultsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<ScanResults>>('scan_results')
}

export async function getScanSheetJobsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<ScanSheetJob>>('scan_sheet_jobs')
}

export async function getSettingsCollection() {
    const db = await getDb()
    return db.collection<WithoutId<Setting>>('settings')
}

/**
 * Ottiene il client MongoDB per iniziare una sessione di transazione
 */
export async function getClient(): Promise<MongoClient> {
    return await clientPromise
}

/**
 * Esegue una funzione in una transazione MongoDB
 * Garantisce atomicità delle operazioni su più documenti/collezioni
 * 
 * @param fn Funzione asincrona che riceve la session e viene eseguita nella transazione
 * @returns Il risultato della funzione
 */
export async function withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>
): Promise<T> {
    const client = await getClient()
    const session = client.startSession()
    
    try {
        let result: T
        await session.withTransaction(async () => {
            result = await fn(session)
        })
        return result!
    } finally {
        await session.endSession()
    }
}