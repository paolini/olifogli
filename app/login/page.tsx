"use client"
import OlimanagerLoginButton from '../components/OlimanagerLoginButton';
import ApolloProviderClient from '../ApolloProviderClient';
import { gql } from '@apollo/client';
import { useGetConfigQuery } from '../graphql/generated';
import Error from '../components/Error';

const GET_CONFIG = gql`
  query GetConfig {
    config {
      OLIMANAGER_URL
    }
  }
`

export default function LoginPage() {
  return <ApolloProviderClient>
    <Login />
  </ApolloProviderClient>
}

function Login() {  
  const { loading, error, data } = useGetConfigQuery();
  if (loading) return <div>Loading...</div>
  if (error) return <Error error={error.message} /> 
  const OLIMANAGER_URL = data?.config?.OLIMANAGER_URL
  return <>
    {OLIMANAGER_URL && <OlimanagerLoginButton url={OLIMANAGER_URL} />}
    {!OLIMANAGER_URL && <Error error="Nessun metodo di login disponibile" />}
  </>
}
