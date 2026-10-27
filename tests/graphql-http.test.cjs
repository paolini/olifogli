const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { startServerAndCreateNextHandler } = require('@as-integrations/next');
const { expressMiddleware } = require('@as-integrations/express5');
const { NextRequest } = require('next/server');
const { AuthenticationError } = require('apollo-server-errors');

// Exercise the real HTTP integrations without ports, .env, databases or OAuth.
// The resolver and context are synthetic; application permissions have their own tests.
function productionServer() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return new ApolloServer({
      typeDefs: 'type Query { protected: String! }',
      resolvers: { Query: { protected: (_, __, context) => {
        if (!context.authenticated) throw new AuthenticationError('autenticazione richiesta');
        return 'authorized';
      } } },
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test('updated Next and Express HTTP integrations preserve production protections', async (t) => {
  for (const transport of ['next', 'express5']) {
    await t.test(transport, async () => {
      const server = productionServer();
      const context = { authenticated: false };
      let request;
      try {
        if (transport === 'next') {
          const handler = startServerAndCreateNextHandler(server, { context: async () => context });
          request = async (query, method = 'POST') => {
            const response = await handler(new NextRequest('http://localhost/graphql', {
              method,
              ...(method === 'POST' ? {
                headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
              } : {}),
            }));
            return { status: response.status, body: await response.json() };
          };
        } else {
          await server.start();
          const middleware = expressMiddleware(server, { context: async () => context });
          request = async (query, method = 'POST') => {
            const response = {
              statusCode: 200, setHeader() {},
              send(value) { this.body = JSON.parse(value); },
            };
            await middleware({
              url: '/graphql', method,
              headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
              body: method === 'POST' ? { query } : undefined,
            }, response);
            return { status: response.statusCode, body: response.body };
          };
        }

        const anonymous = await request('{ protected }');
        assert.equal(anonymous.body.data, null);
        assert.equal(anonymous.body.errors[0].extensions.code, 'UNAUTHENTICATED');
        assert.equal('stacktrace' in anonymous.body.errors[0].extensions, false);

        context.authenticated = true;
        const authorized = await request('{ protected }');
        assert.equal(authorized.status, 200);
        assert.deepEqual(authorized.body.data, { protected: 'authorized' });

        const introspection = await request('{ __schema { queryType { name } } }');
        assert.equal(introspection.status, 400);
        assert.equal(introspection.body.errors[0].extensions.validationErrorCode, 'INTROSPECTION_DISABLED');

        const csrf = await request('', 'GET');
        assert.equal(csrf.status, 400);
        assert.match(csrf.body.errors[0].message, /Cross-Site Request Forgery/);
      } finally {
        await server.stop();
      }
    });
  }
});
