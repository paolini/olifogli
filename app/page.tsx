"use client"
import ApolloProviderClient from '@/app/ApolloProviderClient'

import NavBar from '@/app/components/NavBar' 
import Splash from '@/app/components/Splash'
import { BreadcrumbsProvider } from '@/app/components/BreadcrumbsProvider'
import packageJson from '../package.json'

const version = packageJson.version

export default function Page() {
  return <ApolloProviderClient>
    <BreadcrumbsProvider>
      <NavBar />
      <Splash />
    </BreadcrumbsProvider>
  </ApolloProviderClient>
}
