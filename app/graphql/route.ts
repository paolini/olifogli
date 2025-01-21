import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+

// Definizione dello schema GraphQL
const typeDefs = `
  type Query {
    hello: String
  }
`;

// Definizione dei resolver
const resolvers = {
  Query: {
    hello: () => 'Hello, GraphQL!',
  },
};

// Creazione del server Apollo
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

export const GET = async (req: NextRequest) => {
    return startServerAndCreateNextHandler(server)(req); // Ritorna direttamente la Response
};
  
export const POST = async (req: NextRequest) => {
    return startServerAndCreateNextHandler(server)(req); // Ritorna direttamente la Response
};