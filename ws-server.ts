#!/usr/bin/env node
/*
  Standalone WebSocket server for GraphQL subscriptions (graphql-ws `useServer`).
  It loads the same schema/resolvers as the Next app; queries and mutations are
  served only by Next.js over HTTP.
*/
import 'dotenv/config';
import http from 'http';
import { logDiagnostic, logWebSocketEvent, serverLog, setLogSource } from './app/lib/logging';
import { publishAppLogsToRedis } from './app/lib/appLogPublisher.js';
import { WebSocketServer } from 'ws';
import { useServer as createGraphQLWSServer } from 'graphql-ws/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { getToken } from 'next-auth/jwt';
import { checkSessionSecret } from './app/lib/sessionSecret.js';
import { NextRequest } from 'next/server';
import { GraphQLError, getOperationAST, parse } from 'graphql';
import { ObjectId } from 'mongodb'; // For ObjectId conversion
import { pubsub, TOPICS } from './app/lib/pubsub.js'; // Import the singleton pubsub
import { getUsersCollection } from './app/lib/mongodb.js';
import { watchOlimanagerJobs } from './app/lib/olimanagerJobEvents.js';
import { watchScanJobs } from './app/lib/scanJobEvents.js';
import { getDb } from './app/lib/mongodb.js';
import { redis, CURSOR_KEY, CURSOR_FIELD } from './app/lib/redis.js';

import { typeDefs } from './app/graphql/typedefs.js';
import { resolvers } from './app/graphql/resolvers.js';
import { get_context } from './app/graphql/types.js';

const PORT = process.env.WS_SERVER_PORT || 4001;

setLogSource('ws-server');
publishAppLogsToRedis();

async function start() {
  checkSessionSecret();
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Plain HTTP requests get 404: this process serves only WebSocket upgrades.
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(404).end();
  });

  // WebSocket server
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });

  // Per-connection state: tracks tabId, email, and subscribed sheetIds
  interface ConnectionState {
    tabId: string | undefined
    userId: string
    email: string | undefined
    sheetIds: Set<string>
    isAdmin?: boolean
    isSupervisor?: boolean
  }
  const connectionData = new Map<object, ConnectionState>()

  // Use the same encrypted session cookie and secret as the NextAuth app.
  // NextRequest parses cookies, including the numbered chunks used for large JWTs.
  async function authenticate(cookie: string | undefined) {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;
    const url = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const token = await getToken({
      req: new NextRequest(url, { headers: { cookie: cookie ?? '' } }),
      secret,
      secureCookie: url.startsWith('https://'),
    });
    if (typeof token?.user_id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(token.user_id)) return null;
    return {
      user_id: new ObjectId(token.user_id),
      email: typeof token.email === 'string' ? token.email : undefined,
    };
  }

  const serverCleanup = createGraphQLWSServer({
    schema,
    context: async (ctx) => {
      const identity = await authenticate(ctx.extra.request.headers.cookie);
      if (!identity) throw new GraphQLError('Unauthorized');
      const { user_id, email } = identity;
      const conn = connectionData.get(ctx)
      if (conn) {
        conn.email = email
        // Cache isAdmin/isSupervisor once per connection (avoid repeated DB queries)
        if (user_id !== undefined && conn.isAdmin === undefined) {
          try {
            const usersCollection = await getUsersCollection()
            const user = await usersCollection.findOne(
              { _id: user_id },
              { projection: { isAdmin: 1, isSupervisor: 1 } }
            )
            conn.isAdmin = user?.isAdmin ?? false
            conn.isSupervisor = user?.isSupervisor ?? false
          } catch {
            conn.isAdmin = false
            conn.isSupervisor = false
          }
        } else if (!user_id) {
          conn.isAdmin = false
          conn.isSupervisor = false
        }
      }
      return get_context({ user_id, email, pubsub, isAdmin: conn?.isAdmin, isSupervisor: conn?.isSupervisor });
    },
    onConnect: async (ctx) => {
      const identity = await authenticate(ctx.extra.request.headers.cookie)
      if (!identity) {
        logWebSocketEvent('rejected');
        return false;
      }
      const tabId = ctx.connectionParams?.tabId as string | undefined
      connectionData.set(ctx, { tabId, userId: identity.user_id.toString(), email: undefined, sheetIds: new Set() })
      logWebSocketEvent('connected');
    },
    onDisconnect: async (ctx) => {
      const conn = connectionData.get(ctx)
      if (conn?.tabId) {
        for (const sheetId of conn.sheetIds) {
          // Only cursors stored by this user through the authorized moveCursor are removed.
          if (!await redis.hdel(CURSOR_KEY(sheetId), CURSOR_FIELD(conn.userId, conn.tabId))) continue
          await pubsub.publish(TOPICS.CURSOR_CHANGED(sheetId), {
            cursorChanged: { email: conn.email ?? '', lineKey: null, fieldName: null, tabId: conn.tabId }
          })
        }
      }
      connectionData.delete(ctx)
      logWebSocketEvent('disconnected');
    },
    onSubscribe: async (ctx, id, payload) => {
      if (!await authenticate(ctx.extra.request.headers.cookie)) {
        return [new GraphQLError('Unauthorized')];
      }
      try {
        const operation = getOperationAST(parse(payload.query), payload.operationName);
        if (operation?.operation !== 'subscription') {
          return [new GraphQLError('Only subscription operations are allowed over WebSocket')];
        }
      } catch {
        return [new GraphQLError('Invalid GraphQL document')];
      }
      const conn = connectionData.get(ctx)
      if (conn) {
        const sheetId = payload.variables?.sheetId
        if (sheetId) conn.sheetIds.add(sheetId.toString())
      }
      logWebSocketEvent('subscribed');
    },
    onNext: (ctx, id, _payload, _args, result) => {
      logWebSocketEvent('next', result.errors);
    },
    onError: (ctx, id, payload, errors) => {
      logWebSocketEvent('error', errors);
    },
    onComplete: (ctx, id) => {
      logWebSocketEvent('complete');
    },
  }, wsServer);

  const serverInstance = httpServer.listen(PORT, () => {
    serverLog('info', 'ws.started', { url: `http://localhost:${PORT}/graphql` });
  });

  const scanJobsStream = watchScanJobs(await getDb(),
    (sheetId, kind) => kind === 'scan'
      ? pubsub.publish(TOPICS.SCAN_JOB_UPDATED(sheetId), { scanJobUpdated: true })
      : pubsub.publish(TOPICS.SCAN_SHEET_JOB_UPDATED(sheetId), { scanSheetJobUpdated: true }),
    error => logDiagnostic('ws.scan_jobs.watch_failed', error));

  const olimanagerJobsStream = watchOlimanagerJobs(await getDb(),
    () => pubsub.publish(TOPICS.OLIMANAGER_JOBS_UPDATED, { olimanagerJobsUpdated: true }),
    error => logDiagnostic('ws.olimanager_jobs.watch_failed', error));

  // Gestione della chiusura pulita del server e delle connessioni Redis
  const shutDown = async () => {
    serverLog('info', 'ws.stopping');
    await olimanagerJobsStream.close();
    await scanJobsStream.close();
    await serverCleanup.dispose();
    serverInstance.close(async () => {
      serverLog('info', 'ws.stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);
}

start().catch(err => {
  logDiagnostic('ws.start_failed', err);
  process.exit(1);
});
