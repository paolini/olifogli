// Definizione dello schema GraphQL
export const typeDefs = `
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
    updatedOn: Timestamp
    cognome: String
    nome: String
    classe: String
    sezione: String
    scuola: String
    data_nascita: String
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
    data: [Row]
    me: User
  }

  type Mutation {
    addSheet(name: String, schema: String, params: String): Sheet
    deleteSheet(_id: ObjectId): String

    addRow(cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    patchRow(_id: ObjectId, updatedOn: Timestamp, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    deleteRow(_id: ObjectId): ObjectId
  }
`
