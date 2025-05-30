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
    params: String
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

  type Scan {
    _id: ObjectId
    timestamp: Timestamp
    sheetId: ObjectId
    jobId: String
    status: String
    message: String
  }

  type ScanResults {
    _id: ObjectId
    sheetId: ObjectId
    jobId: String
    image: String
    data: JSON
  }

  type Query {
    hello: String
    me: User
    users: [User]
    config: Config
    sheets: [Sheet]
    sheet(sheetId: ObjectId): Sheet
    rows(sheetId: ObjectId): [Row]
    scans(sheetId: ObjectId): [Scan]
    scanResults(sheetId: ObjectId, jobId: String): [ScanResults]
    olimanager: String # testing
  }

  type Mutation {
    addSheet(name: String, schema: String, params: String): Sheet
    deleteSheet(_id: ObjectId): String

    addRow(sheetId: ObjectId, data: JSON, answers: [String]): Row
    patchRow(_id: ObjectId, updatedOn: Timestamp, data: JSON, answers: [String]): Row
    deleteRow(_id: ObjectId): ObjectId
    
    addRows(sheetId: ObjectId!, columns: [String!]!, rows: [[String!]!]!): Int
  }
`
