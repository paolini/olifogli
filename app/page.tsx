"use client"
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario
import UserProfile from '@/app/components/UserProfile'
import Sheets from '@/app/components/Sheets'
import packageJson from '../package.json'
import Link from 'next/link'
import { useSession } from "next-auth/react"


const version = packageJson.version

export default function Page() {
  return <ApolloProviderClient>
    <h1>Olifogli v. {version}</h1>
    <div style={{ textAlign: 'right' }}>
      <UserProfile />
    </div>
    <Link href="users">utenti</Link>
    <Sheets />
  </ApolloProviderClient>
}

//<Table schema={new Distrettuale()}/>
