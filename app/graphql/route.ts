import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { typeDefs } from './typedefs'
import { resolvers } from './resolvers'
import { Context } from './types'
import { ObjectId } from 'mongodb';

// Creazione del server Apollo
const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

let handler;
if (!handler) {
  handler = startServerAndCreateNextHandler<NextRequest,Context>(server, {
    context: async (req, res): Promise<Context> => {
      const session = JSON.parse(req.cookies.get('session')?.value || '{}');

      if (session.userId) return {req, res, userId: new ObjectId(session.userId as string)};
      return {req, res};
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
