import { ObjectId } from 'mongodb';
import { getDb } from './mongodb'

export interface User {
    uid: string;
    name: string;
}

export async function getUsers() {
    const db = await getDb();
    return db.collection<User>('users');
}

export interface Row {
    cognome?: string;
    nome?: string;
    classe?: string;
    sezione?: string;
    scuola?: string;
    data_nascita?: string;
    risposte?: string[];

    updatedOn?: Date;
    updatedBy?: ObjectId;
}

export async function getRows() {
    const db = await getDb();
    return db.collection<Row>('rows');
}