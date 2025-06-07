import { gql } from '@apollo/client'

// Definizione dello schema GraphQL
export const typeDefs = gql`
  scalar Timestamp
  scalar ObjectId
  scalar JSON

  type Sheet {
    _id: ObjectId
    name: String
    schema: String
    permissions: [SheetPermission]
    owner_id: ObjectId
  }
  
  type SheetPermission {
    user_id: ObjectId
    user_email: String
    filter_field: String
    filter_value: String
  }

  type Row {
    _id: ObjectId
    isValid: Boolean
    updatedOn: Timestamp
    data: JSON
  }

  type User {
    _id: ObjectId
    uid: Int
    email: String
    name: String
    is_admin: Boolean
  }

  type Config {
    OLIMANAGER_URL: String
  }

  type ScanMessage {
    status: String
    message: String
    timestamp: Timestamp
  }

  type ScanJob {
    _id: ObjectId
    sheetId: ObjectId
    owner_id: ObjectId
    timestamp: Timestamp
    messages: [ScanMessage]
    message: ScanMessage
  }

  type ScanResults {
    _id: ObjectId
    sheetId: ObjectId
    jobId: ObjectId
    image: String
    raw_data: JSON
  }

  type Query {
    hello: String
    me: User
    users: [User]
    config: Config
    sheets: [Sheet]
    sheet(sheetId: ObjectId): Sheet
    rows(sheetId: ObjectId): [Row]
    scanJobs(sheetId: ObjectId, userId: ObjectId): [ScanJob]
    scanResults(jobId: ObjectId): [ScanResults]
    olimanager: String # testing
  }

  type Mutation {
    addSheet(name: String, schema: String): Sheet
    deleteSheet(_id: ObjectId): String

    addRow(sheetId: ObjectId, data: JSON, answers: [String]): Row
    patchRow(_id: ObjectId, updatedOn: Timestamp, data: JSON, answers: [String]): Row
    deleteRow(_id: ObjectId): ObjectId
    
    addRows(sheetId: ObjectId!, columns: [String!]!, rows: [[String!]!]!): Int
    deleteScan(sheetId: ObjectId!, jobId: String): Boolean
  }
`
