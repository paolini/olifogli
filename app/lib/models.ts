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
    isAdmin?: boolean // può fare tutto
    isSupervisor?: boolean // può vedere tutto, ma non modificare
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
    email: string
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
    updatedAt: Date

    // denormalized statistics
    nRows: number // Numero di righe collegate (denormalizzato, gestito con transazioni)
    nValidRows: number // Numero di righe valide con error='' (denormalizzato, gestito con transazioni)
    nSyncedRows: number // Numero di righe sincronizzate con Olimanager (denormalizzato, gestito con transazioni)
    anomalies: number // Numero totale di anomalie nelle righe valide (denormalizzato, gestito con transazioni)
    nScanJobs: number // Numero di ScanJobs associati a questo foglio (denormalizzato, gestito con transazioni)
    nScanSheetJobs: number // Numero di ScanSheetJobs associati a questo foglio (denormalizzato, gestito con transazioni)

    olimanagerJobId?: ObjectId // prevents unlocking/reopening while a check is queued or running
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
    error: string // eventuale errore di validazione
    anomalies: number // numero di anomalie riscontrate in questa riga

    data: Data

    createdOn: Date
    createdBy: string
    updatedOn: Date
    updatedBy: string
    olimanager?: {
        participantId?: string
        contestId?: string
        participantCreatedOn?: Date 
        resultsUpdatedOn?: Date
        error: string
    }
    encrypted_data?: string // se presente, i dati originali della riga criptati
}

export type Workbook = {
    _id: ObjectId
    name: string
    ownerId: ObjectId
    commonData: Record<string, string>
    createdOn: Date
    updatedOn: Date
    createdBy: string
    updatedBy: string
}

export type ScanMessage = {
    status: string
    message: string
    timestamp: Date
}

export type ScanJob = {
    _id: ObjectId
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

export type ScanSheetJob = {
    _id: ObjectId
    sheetId: ObjectId
    timestamp: Date
    filename?: string
    status: 'pending' | 'completed' | 'error' | 'processing'
    message: string
    createdBy: string
}

export type Setting = {
    _id: ObjectId
    key: string
    value: string
    updatedBy: string
    updatedOn: Date
}

// First worker operation is a local check; it never transfers data to Olimanager.
export type OlimanagerJob = {
    _id: ObjectId
    operation: 'check_participants'
    rowIds: ObjectId[]
    sheetIds: ObjectId[]
    affectedSheetIds: ObjectId[]
    endpoint: string
    createdBy: ObjectId
    createdAt: Date
    status: 'queued' | 'preparing' | 'running' | 'completed' | 'completed_with_errors' | 'failed'
    totalRows: number
    succeededRows: number
    failedRows: number
    preparedAt?: Date
    startedAt?: Date
    finishedAt?: Date
    error?: string
    leaseOwner?: string
    leaseExpiresAt?: Date
}

export type OlimanagerJobItem = {
    _id: ObjectId
    jobId: ObjectId
    rowId: ObjectId
    sheetId?: ObjectId
    status: 'pending' | 'succeeded' | 'failed'
    attempts: number
    error?: string
    finishedAt?: Date
}
