import { ObjectId } from 'bson';
import { AvailableSchemas } from './schema';

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
    user_id?: ObjectId
    user_email?: string
    filter_field?: string
    filter_value?: string
}

export interface Sheet {
    _id: ObjectId
    name: string
    schema: AvailableSchemas
    params: string
    owner_id: ObjectId
    permissions: SheetPermission[]
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

export interface Scan {
    _id: ObjectId
    sheetId: ObjectId
    jobId: string
    status: string
    message?: string
    timestamp: Date
}

export interface ScanResults {
    _id: ObjectId
    sheetId: ObjectId
    jobId: string
    image: string
    raw_data: Data
}

