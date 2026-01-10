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
    updatedAt: Date

    // denormalized statistics
    nRows: number // Numero di righe collegate (denormalizzato, gestito con transazioni)
    nValidRows: number // Numero di righe valide con error='' (denormalizzato, gestito con transazioni)
    nSyncedRows: number // Numero di righe sincronizzate con Olimanager (denormalizzato, gestito con transazioni)
    anomalies: number // Numero totale di anomalie nelle righe valide (denormalizzato, gestito con transazioni)
    nScanJobs: number // Numero di ScanJobs associati a questo foglio (denormalizzato, gestito con transazioni)
    nScanSheetJobs: number // Numero di ScanSheetJobs associati a questo foglio (denormalizzato, gestito con transazioni)

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

export type RowSelection = {
    label: string // etichetta della selezione
    selected_by: string // email di chi ha selezionato
    timestamp: Date // data della selezione 
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
        participantCreatedOn?: Date 
        resultsUpdatedOn?: Date
        error: string
    }
    selections?: RowSelection[]
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
