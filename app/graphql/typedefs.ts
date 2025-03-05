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
    name: String
  }

  type Config {
    OLIMANAGER_URL: String
  }

  type Query {
    hello: String
    config: Config
    sheets: [Sheet]
    sheet: Sheet
    rows(sheetId: ObjectId): [Row]
    me: User
    olimanager: String
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
