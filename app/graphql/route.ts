import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';

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

// Esporta un handler per ogni metodo HTTP
export const GET = startServerAndCreateNextHandler(server);
export const POST = startServerAndCreateNextHandler(server);
