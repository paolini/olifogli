"use client"
import { useQuery, gql } from '@apollo/client';
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario

export default function Hello() {
  return (
    <ApolloProviderClient>
        <Inner />
    </ApolloProviderClient>
  );
}

const GET_HELLO = gql`
  query {
    hello
  }
`;

function Inner() {
  const { loading, error, data } = useQuery(GET_HELLO);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <div>{data.hello}</div>;
}


