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

export async function getSheetsCollection() {
    const db = await getDb();
    return db.collection<Sheet>('sheets');
}

export type Data = {
  [key: string]: string
}

export interface Row {
    sheetId: ObjectId;
    isValid: boolean;

    data: Data;

    createdOn?: Date;
    createdBy?: ObjectId;
    updatedOn?: Date;
    updatedBy?: ObjectId;
}

export async function getRowsCollection() {
    const db = await getDb();
    return db.collection<Row>('rows');
}

export interface Scan {
    sheetId: ObjectId;
    jobId: string;
    status: string;
    message?: string;
}

export async function getScansCollection() {
    const db = await getDb();
    return db.collection<Scan>('scans');
}