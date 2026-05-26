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
  app.use('/graphql', expressMiddleware(server, { context: async () => get_context({ pubsub }) }));

  // WebSocket server
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });

  // Per-connection state: tracks tabId, email, and subscribed sheetIds
  interface ConnectionState {
    tabId: string | undefined
    email: string | undefined
    sheetIds: Set<string>
  }
  const connectionData = new Map<object, ConnectionState>()

  const serverCleanup = useServer({
    schema,
    context: async (ctx) => {
      const sessionToken = ctx.connectionParams?.sessionToken as string | undefined;
      let user_id;
      let email;
      if (sessionToken) {
        const decodedToken = jwt.decode(sessionToken) as { user_id?: string; email?: string } | null;
        user_id = decodedToken?.user_id ? new ObjectId(decodedToken.user_id) : undefined;
        email = decodedToken?.email;
      }
      // Store email in connection data for use on disconnect
      const conn = connectionData.get(ctx)
      if (conn) conn.email = email
      return get_context({ user_id, email, pubsub });
    },
    onConnect: (ctx) => {
      const tabId = ctx.connectionParams?.tabId as string | undefined
      connectionData.set(ctx, { tabId, email: undefined, sheetIds: new Set() })
      console.log('[ws] client connected tabId=%s', tabId ?? '(none)');
    },
    onDisconnect: async (ctx) => {
      const conn = connectionData.get(ctx)
      if (conn?.tabId) {
        for (const sheetId of conn.sheetIds) {
          await pubsub.publish(TOPICS.CURSOR_CHANGED(sheetId), {
            cursorChanged: { email: conn.email ?? null, lineKey: null, fieldName: null, tabId: conn.tabId }
          })
        }
      }
      connectionData.delete(ctx)
      console.log('[ws] client disconnected tabId=%s', conn?.tabId ?? '(unknown)');
    },
    onSubscribe: (ctx, id, payload) => {
      const conn = connectionData.get(ctx)
      if (conn) {
        const sheetId = payload.variables?.sheetId
        if (sheetId) conn.sheetIds.add(sheetId.toString())
      }
      console.log('[ws] subscribe id=%s', id);
    },
    onNext: (ctx, id, _payload, _args, result) => {
      console.log('[ws] → id=%s payload=%s', id, JSON.stringify(result.data));
    },
    onError: (ctx, id, errors) => {
      console.error('[ws] error id=%s', id, errors);
    },
    onComplete: (ctx, id) => {
      console.log('[ws] complete id=%s', id);
    },
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