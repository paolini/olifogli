import { ApolloClient, ApolloError, ApolloLink, InMemoryCache, HttpLink, Observable, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { getWebSocketClient, subscribeWebSocketReconnect } from './webSocketConnection';
import { logDiagnostic } from './logging';

const createApolloClient = () => {
  const httpLink = new HttpLink({
    uri: typeof window !== 'undefined' ? `${window.location.origin}/graphql` : '/graphql',
    credentials: 'include',
  });

  const wsLink = typeof window !== 'undefined'
    ? new ApolloLink(operation => new Observable(observer => {
        return new GraphQLWsLink(getWebSocketClient()).request(operation).subscribe({
          next: result => observer.next(result),
          complete: () => observer.complete(),
          error: error => {
            // GraphQL errors are server responses; socket failures have no GraphQL code.
            if (error instanceof ApolloError && error.graphQLErrors.length > 0) {
              observer.error(error);
            } else {
              observer.error(Object.assign(new Error('Connessione WebSocket non disponibile.'), {
                code: 'WEBSOCKET_CONNECTION_ERROR',
              }));
            }
          },
        });
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

// After a reconnection the active queries are reloaded, so that changes made
// while the socket was down appear without reloading the page.
if (typeof window !== 'undefined') {
  subscribeWebSocketReconnect(() => {
    apolloClient.refetchQueries({ include: 'active' })
      .catch(error => logDiagnostic('app/lib/apolloClient.reconnect_refetch_error', error, 'warn'));
  });
}
