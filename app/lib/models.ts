import { ObjectId } from 'mongodb';
import { getDb } from './mongodb'
import { AvailableSchemas } from './schema';

export interface User {
    uid: string;
    name: string;
}

export async function getUsersCollection() {
    const db = await getDb();
    return db.collection<User>('users');
}

export interface Sheet {
    name: string;
    schema: AvailableSchemas;
    params: string;
}

export type SheetWithId = Sheet & { _id: string };

export async function getSheetsCollection() {
    const db = await getDb();
    return db.collection<Sheet>('sheets');
}

export interface Row {
    cognome: string;
    nome: string;
    classe: string;
    sezione: string;
    scuola: string;
    data_nascita: string;
    risposte: string[];

    sheet_id: ObjectId;
    is_valid: boolean;

    createdOn?: Date;
    createdBy?: ObjectId;
    updatedOn?: Date;
    updatedBy?: ObjectId;
}

export async function getRowsCollection() {
    const db = await getDb();
    return db.collection<Row>('rows');
}