#!/usr/bin/env node
/*
  Simple standalone server that exposes HTTP GraphQL endpoint and a WebSocket server
  using graphql-ws `useServer`. It loads the same schema/resolvers as the Next app.
*/
import http from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws'; // <-- Cambiato da 'graphql-ws' a 'graphql-ws/use/ws'
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { makeExecutableSchema } from '@graphql-tools/schema';
import jwt from 'jsonwebtoken'; // For WebSocket token decoding
import { ObjectId } from 'mongodb'; // For ObjectId conversion
import { pubsub, TOPICS } from './app/lib/pubsub.js'; // Import the singleton pubsub

import { typeDefs } from './app/graphql/typedefs.js';
import { resolvers } from './app/graphql/resolvers.js';
import { get_context } from './app/graphql/types.js';

const PORT = process.env.WS_SERVER_PORT || 4001;

async function start() {
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const httpServer = http.createServer(app);

  // Apollo Server for HTTP
  const server = new ApolloServer({ schema, plugins: [] });
  await server.start();
  app.use('/graphql', expressMiddleware(server, { context: async ({ req }) => get_context({ req, pubsub }) }));

  // WebSocket server
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });

  const serverCleanup = useServer({
    schema,
    context: async (ctx) => {
      // Extract token from connectionParams for WebSocket authentication
      const sessionToken = ctx.connectionParams?.sessionToken;
      let user_id;
      let email;
      if (sessionToken) {
        // In un'applicazione reale, dovresti verificare questo token usando NEXTAUTH_SECRET.
        // Per semplicità, lo decodifichiamo solamente.
        // La struttura del payload del token dovrebbe corrispondere a OLIMANAGER_TOKEN.
        const decodedToken = jwt.decode(sessionToken) || {};
        user_id = decodedToken.user_id ? new ObjectId(decodedToken.user_id) : undefined;
        email = decodedToken.email;
      }
      return get_context({ user_id, email, pubsub });
    }
  }, wsServer);

  const serverInstance = httpServer.listen(PORT, () => {
    console.log(`GraphQL HTTP+WS server listening on http://localhost:${PORT}/graphql`);
  });

  // Gestione della chiusura pulita del server e delle connessioni Redis
  const shutDown = async () => {
    console.log('\nSpegnimento del server in corso...');
    await serverCleanup.dispose();
    await server.stop();
    serverInstance.close(async () => {
      console.log('Server e connessioni Redis chiuse correttamente.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);
}

start().catch(err => {
  console.error('ws-server error', err);
  process.exit(1);
});