import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { getDb } from '@/lib/mongodb';

// Definizione dello schema GraphQL
const typeDefs = `
  type Query {
    hello: String
    data: [Row]
  }

  type Row {
    _id: String
    cognome: String
    nome: String
    classe: Int
    sezione: String
    scuola: String
    data_nascita: String
    risposte: [String]
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
            cognome: doc.cognome,
            nome: doc.nome,
            classe: doc.classe,
            sezione: doc.sezione,
            scuola: doc.scuola,
            data_nascita: doc.data_nascita,
            risposte: ['','','','','','','','','','','','','','','','','','','',''],
          }));  
    }
  },
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
