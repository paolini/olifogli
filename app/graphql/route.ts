import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

interface User {
  email: string;
  uid: string;
}

export type Context = {
  req: NextRequest
  res: Response|undefined
  user?: User
}

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

  type User {
    email: String
    uid: Int
  }

  type Query {
    hello: String
    data: [Row]
    me: User
  }

  type Mutation {
    addRow(cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    updateRow(_id: String, cognome: String, nome: String, classe: String, sezione: String, scuola: String, data_nascita: String, risposte: [String]): Row
    deleteRow(_id: String): String
  }
`;

// Definizione dei resolver
const resolvers = {
  Query: {
    hello: () => 'Hello, world!',
    me: (_:unknown, __: unknown, context: Context) => {
      const {user} = context 
      if (user) {
        return {
          email: user.email,
          uid: user.uid,
        };
      } else return null
    },
    data: async () => {
        const db = await getDb();
        const collection = db.collection('rows');
        const results = await collection.find({}).toArray();
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
      await collection.updateOne({ _id: new ObjectId(_id) }, { $set: { cognome, nome, classe, sezione, scuola, data_nascita, risposte } });
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
    },
    deleteRow: async (_: unknown, { _id }: { _id: string }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.deleteOne({ _id: new ObjectId(_id) });
      return _id;
    },
  }
};

// Creazione del server Apollo
const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

let handler;
if (!handler) {
  handler = startServerAndCreateNextHandler<NextRequest,Context>(server, {
    context: async (req, res): Promise<Context> => { 
      const ctx: Context = { req, res };
      const token = req.cookies.get('auth_token')?.value;

      if (!token) {
        // No token found, user is not authenticated
        return ctx 
      }
    
      const OLIMANAGER_PUBLIC_KEY = process.env.OLIMANAGER_PUBLIC_KEY;
      if (OLIMANAGER_PUBLIC_KEY) {
        jwt.verify(token, OLIMANAGER_PUBLIC_KEY, { algorithms: ['RS256'] });
        const decoded = jwt.decode(token) as {sub: string, uid: string};
        const {sub, uid} = decoded;
        return {
          ...ctx,
          user: { 
            email: sub,
            uid,
          },
        }
      }

      return ctx
    }
  });
}

// Esporta il gestore per GET e POST
export const GET = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};

export const POST = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};
