"use client"
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario
import UserProfile from '@/app/components/UserProfile'
import { Distrettuale } from '@/lib/schema'
import Table from '@/app/components/Table'
import packageJson from '../package.json'
const version = packageJson.version

export default function Home() {
  return <ApolloProviderClient>
    <h1>Olifogli v. {version}</h1>
    <div style={{ textAlign: 'right' }}>
      <UserProfile />
    </div>
    <Table schema={new Distrettuale()}/>
  </ApolloProviderClient>
}

