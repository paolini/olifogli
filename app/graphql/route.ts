import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Definizione dello schema GraphQL
const typeDefs = `
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

  type Query {
    hello: String
    data: [Row]
  }

  type Mutation {
    addRow(cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    updateRow(_id: String, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
  }
`;


// Definizione dei resolver
const resolvers = {
  Query: {
    hello: () => 'Hello, world!',
    data: async () => {
        const db = await getDb();
        const collection = db.collection('rows');
        const results = await collection.find({}).toArray();
        console.log(`mapping ${JSON.stringify(results)}`);
        return results.map(doc => ({
            _id: doc._id.toString(),
            cognome: doc.cognome || '',
            nome: doc.nome || '',
            classe: doc.classe || '',
            sezione: doc.sezione || '',
            scuola: doc.scuola || '',
            data_nascita: doc.data_nascita || '',
            risposte: Array.isArray(doc.risposte)? doc.risposte : ['','','','','','','','','','','','','','','','','','','',''],
          }));  
    }
  },
  Mutation: {
    addRow: async (_: unknown, { cognome, nome, classe, sezione, scuola, data_nascita, risposte }: { 
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      const result = await collection.insertOne({ cognome, nome, classe, sezione, scuola, data_nascita, risposte });
      return {
          _id: result.insertedId.toString(),
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      };
    },
    updateRow: async (_: unknown, { _id, cognome, nome, classe, sezione, scuola, data_nascita, risposte }: {
        _id: string,
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      const result = await collection.updateOne({ _id: new ObjectId(_id) }, { $set: { cognome, nome, classe, sezione, scuola, data_nascita, risposte } });
      return {
          _id,
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      }
    }
  }
};

// Creazione del server Apollo
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

let handler;
if (!handler) {
  handler = startServerAndCreateNextHandler(server);
}

// Esporta il gestore per GET e POST
export const GET = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};

export const POST = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};
