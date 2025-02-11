import { gql } from '@apollo/client'

// Definizione dello schema GraphQL
export const typeDefs = gql`
  scalar Timestamp
  scalar ObjectId

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
    cognome: String
    nome: String
    classe: String
    sezione: String
    scuola: String
    dataNascita: String
    risposte: [String]
  }

  type User {
    _id: ObjectId
    uid: Int
    name: String
  }

  type Query {
    hello: String
    sheets: [Sheet]
    sheet: Sheet
    rows(sheetId: ObjectId): [Row]
    me: User
  }

  type Mutation {
    addSheet(name: String, schema: String, params: String): Sheet
    deleteSheet(_id: ObjectId): String

    addRow(sheetId: ObjectId, cognome: String, nome: String, classe: String, sezione: String, scuola: String, dataNascita: String, risposte: [String]): Row
    patchRow(_id: ObjectId, updatedOn: Timestamp, cognome: String, nome: String, classe: String, sezione: String, scuola: String, dataNascita: String, risposte: [String]): Row
    deleteRow(_id: ObjectId): ObjectId
  }
`
