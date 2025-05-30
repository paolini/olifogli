"use client"
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario

import UserProfile from '@/app/components/UserProfile'
import Splash from '@/app/components/Splash'
import packageJson from '../package.json'

const version = packageJson.version

export default function Page() {
  return <ApolloProviderClient>
    <h1>Olifogli v. {version}</h1>
    <div style={{ textAlign: 'right' }}>
      <UserProfile />
    </div>
    <Splash />
  </ApolloProviderClient>
}
