import ApolloProviderClient from '@/app/ApolloProviderClient'
import { ReactNode } from 'react'

import NavBar from '@/app/components/NavBar'

export default function Page({children}: {children: ReactNode}) {
    return <div className="p-1">
        <ApolloProviderClient>
            <NavBar />
            {children}
        </ApolloProviderClient>
    </div>
}