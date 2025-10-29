import ApolloProviderClient from '@/app/ApolloProviderClient'
import { ReactNode } from 'react'

import NavBar from '@/app/components/NavBar'
import { BreadcrumbsProvider } from '@/app/components/BreadcrumbsProvider'

export default function Page({children}: {children: ReactNode}) {
    return <div className="page-wrapper">
        <ApolloProviderClient>
            <BreadcrumbsProvider>
                <NavBar />
                <div className="page-content">
                    {children}
                </div>
            </BreadcrumbsProvider>
        </ApolloProviderClient>
    </div>
}