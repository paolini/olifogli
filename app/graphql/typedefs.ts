// Definizione dello schema GraphQL
export const typeDefs = `
  type Row {
    _id: String
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
    patchRow(_id: String, old_timestamp: String, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    updateRow(_id: String, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    deleteRow(_id: String): String
  }
`
