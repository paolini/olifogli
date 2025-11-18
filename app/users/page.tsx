"use client"
import { gql } from '@apollo/client'
import ApolloProviderClient from '@/app/ApolloProviderClient'

import NavBar from "../components/NavBar"
import { BreadcrumbsProvider } from '@/app/components/BreadcrumbsProvider'
import Users from '@/app/components/Users'

export default function Page() {
    return <ApolloProviderClient>
        <BreadcrumbsProvider>
            <NavBar />
            <Users />
        </BreadcrumbsProvider>
    </ApolloProviderClient>
}

