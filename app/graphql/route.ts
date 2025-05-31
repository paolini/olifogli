import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+

import { typeDefs } from './typedefs'
import { resolvers } from './resolvers'
import { Context, get_context } from './types'

// Creazione del server Apollo
const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

let handler;
if (!handler) {
  handler = startServerAndCreateNextHandler<NextRequest,Context>(server, {
    context: get_context
  })
}

// Esporta il gestore per GET e POST
export const GET = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};

export const POST = async (req: NextRequest) => {
  return handler(req); // Restituisci la risposta
};
