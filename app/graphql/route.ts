import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import jwt from 'jsonwebtoken';
import { typeDefs } from './typedefs'
import { resolvers } from './resolvers'
import { Context } from './types'

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
        const decoded = jwt.decode(token) as {uid: string};
        const {uid} = decoded;
        return {
          ...ctx,
          user: { 
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
