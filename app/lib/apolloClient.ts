import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';

const createApolloClient = () => {
  const httpLink = new HttpLink({
    uri: typeof window !== 'undefined' ? `${window.location.origin}/graphql` : '/graphql',
    credentials: 'include',
  });

  const wsLink = typeof window !== 'undefined'
    ? new GraphQLWsLink(createClient({
        // In development connect directly to ws-server port 4001;
        // in production route through nginx at /ws/ (same origin, SSL handled by reverse proxy)
        url: window.location.hostname === 'localhost'
          ? `ws://localhost:4001/graphql`
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/graphql`,
      }))
    : null;

  // Split link: usa WebSocket per le subscription, HTTP per il resto
  const link = (wsLink && typeof window !== 'undefined')
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === 'OperationDefinition' &&
            definition.operation === 'subscription'
          );
        },
        wsLink,
        httpLink,
      )
    : httpLink;

  return new ApolloClient({
    ssrMode: typeof window === 'undefined', // Attiva SSR (Server-Side Rendering) in Next.js
    link, // Usa lo split link che instrada correttamente tra HTTP e WS
    cache: new InMemoryCache()
  });
};

export const apolloClient = createApolloClient();
