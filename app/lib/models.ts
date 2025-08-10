import { ObjectId } from 'bson';

export interface Account {
    _id: ObjectId
    provider: string
    providerAccountId: string
    user_id: ObjectId
    accessToken?: string
    refreshToken?: string
    idToken: string
    expiresAt?: Date | null
    updatedAt?: Date | null
}

export interface User {
    _id: ObjectId
    name: string
    email: string
    is_admin?: boolean
    createdAt?: Date
    lastLogin?: Date
}

export interface SheetPermission {
    _id: ObjectId
    sheet_id: ObjectId
    user_id?: ObjectId
    user_email?: string
    filter_field?: string
    filter_value?: string
}

export interface Sheet {
    _id: ObjectId
    name: string
    schema: string
    owner_id: ObjectId
}

export type Data = {
  [key: string]: string
}

export interface Row {
    _id: ObjectId
    sheetId: ObjectId
    isValid: boolean

    data: Data

    createdOn?: Date
    createdBy?: ObjectId
    updatedOn?: Date
    updatedBy?: ObjectId
}

export interface ScanMessage {
    status: string
    message: string
    timestamp: Date
}

export interface ScanJob {
    _id: ObjectId
    // jobId: string // old migrated scans
    sheetId: ObjectId
    timestamp: Date
    ownerId: ObjectId
    messages: ScanMessage[]
}

export interface ScanResults {
    _id: ObjectId
    jobId: ObjectId
    image: string
    raw_data: Data
}

