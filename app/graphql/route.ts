import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { ObjectId } from 'mongodb';
import { getToken } from "next-auth/jwt"

import { typeDefs } from './typedefs'
import { resolvers } from './resolvers'
import { Context } from './types'
import { OLIMANAGER_TOKEN } from '../api/auth/[...nextauth]/route'

// Creazione del server Apollo
const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

let handler;
if (!handler) {
  handler = startServerAndCreateNextHandler<NextRequest,Context>(server, {
    context: async (req, res): Promise<Context> => {
      const {user_id, is_admin } = await getToken({ req }) as OLIMANAGER_TOKEN
      return {req, res, user_id: user_id ? new ObjectId(user_id) : undefined, is_admin};
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
