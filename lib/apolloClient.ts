import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const createApolloClient = () => {
  return new ApolloClient({
    ssrMode: typeof window === 'undefined', // Attiva SSR (Server-Side Rendering) in Next.js
    link: new HttpLink({
      uri: '/graphql', // Indirizzo del server GraphQL
      credentials: 'same-origin', // Assicurati di inviare i cookie correttamente
    }),
    cache: new InMemoryCache(),
  });
};

export const apolloClient = createApolloClient();
