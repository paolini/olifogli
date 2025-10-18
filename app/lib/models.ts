import { ObjectId } from 'bson';

export type Account = {
    _id: ObjectId
    provider: string
    providerAccountId: string
    userId: ObjectId
    accessToken?: string
    refreshToken?: string
    idToken: string
    expiresAt?: Date | null
    updatedAt?: Date | null
}

export type User = {
    _id: ObjectId
    name: string
    email: string
    isAdmin?: boolean
    createdAt?: Date
    lastLogin?: Date
}

/**
 * owner: può fare tutto (i superutenti sono considerati owner di tutti i fogli)
 * admin: può fare tutto sui fogli dove ha questo permesso
 *        in particolare può dare permessi admin/editor/view a chi vuole
 * editor: può modificare i dati, ma non i metadati (nome, schema, permessi)
 * view: può solo vedere i dati, non può modificarli
 */

export type SheetPermissionRole = 'owner' | 'admin' | 'editor' | 'view';

export type Permission = {
    email?: string
    userId?: ObjectId
    role: SheetPermissionRole
}

export type Sheet = {
    _id: ObjectId
    name: string
    schema: string
    ownerId: ObjectId
    permissions: Permission[]
    workbookId: ObjectId
    commonData: Record<string, string>
    createdAt: Date
    closed?: boolean
    closedBy?: string
    closedOn?: Date
    locked?: boolean
    lockedBy?: string
    lockedOn?: Date
}

export type Data = {
  [key: string]: string
}

export type Row = {
    _id: ObjectId
    sheetId: ObjectId
    isValid: boolean

    data: Data

    createdOn: Date
    createdBy: ObjectId
    updatedOn: Date
    updatedBy: ObjectId
}

export type Workbook = {
    _id: ObjectId
    name: string
    ownerId: ObjectId
    createdOn: Date
    updatedOn: Date
    createdBy: ObjectId
    updatedBy: ObjectId
}

export type ScanMessage = {
    status: string
    message: string
    timestamp: Date
}

export type ScanJob = {
    _id: ObjectId
    // jobId: string // old migrated scans
    sheetId: ObjectId
    timestamp: Date
    ownerId: ObjectId
    messages: ScanMessage[]
}

export type ScanResults = {
    _id: ObjectId
    jobId: ObjectId
    image: string
    rawData: Data
}

