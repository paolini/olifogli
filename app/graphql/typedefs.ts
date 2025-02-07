// Definizione dello schema GraphQL
export const typeDefs = `
  scalar Timestamp

  type Sheet {
    _id: String
    name: String
    schema: String
    params: String
  }

  type Row {
    _id: String
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
    _id: String
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
    deleteSheet(_id: String): String

    addRow(cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    patchRow(_id: String, updatedOn: Timestamp, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    deleteRow(_id: String): String
  }
`
