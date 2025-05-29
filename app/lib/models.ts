import { ObjectId } from 'mongodb';
import { getDb } from './mongodb'
import { AvailableSchemas } from './schema';

export interface Account {
    provider: string
    providerAccountId: string
    user_id: ObjectId
    accessToken?: string
    refreshToken?: string
    idToken: string
    expiresAt?: Date | null
    updatedAt?: Date | null
}

export async function getAccountsCollection() {
    const db = await getDb();
    return db.collection<Account>('accounts');
}

export interface User {
    name: string
    email: string
    is_admin?: boolean
    createdAt?: Date
    lastLogin?: Date
}

export async function getUsersCollection() {
    const db = await getDb()
    return db.collection<User>('users')
}

export interface Sheet {
    name: string
    schema: AvailableSchemas
    params: string
    owner_id: ObjectId
}

export async function getSheetsCollection() {
    const db = await getDb()
    return db.collection<Sheet>('sheets')
}

export type Data = {
  [key: string]: string
}

export interface Row {
    sheetId: ObjectId
    isValid: boolean

    data: Data

    createdOn?: Date
    createdBy?: ObjectId
    updatedOn?: Date
    updatedBy?: ObjectId
}

export async function getRowsCollection() {
    const db = await getDb()
    return db.collection<Row>('rows')
}

export interface Scan {
    sheetId: ObjectId
    jobId: string
    status: string
    message?: string
    timestamp: Date
}

export async function getScansCollection() {
    const db = await getDb()
    return db.collection<Scan>('scans')
}

export interface ScanResults {
    sheetId: ObjectId
    jobId: string
    image: string
    data: Data
}

export async function getScanResultsCollection() {
    const db = await getDb()
    return db.collection<ScanResults>('scan_results')
}
