// Definizione dello schema GraphQL
export const typeDefs = `
  scalar Timestamp

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
    uid: Int
    name: String
  }

  type Query {
    hello: String
    data: [Row]
    me: User
  }

  type Mutation {
    addRow(cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    patchRow(_id: String, updatedOn: Timestamp, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    deleteRow(_id: String): String
  }
`
