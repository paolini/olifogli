import ApolloProviderClient from '@/app/ApolloProviderClient'
import { ReactNode } from 'react'
import { useSession } from 'next-auth/react'

import NavBar from '@/app/components/NavBar'
import Loading from '@/app/components/Loading'
import { BreadcrumbsProvider } from '@/app/components/BreadcrumbsProvider'
import { ApiScopeRequired, LoginRequired } from '@/app/components/LoginForm'

// Every page except the home page needs a login: without a session the page
// is not mounted (no queries) and a login form brings back here afterwards.
// Pages reading Olimanager (requireApiScope) also need a valid token with the
// api scope.
export default function Page({children, requireApiScope = false}: {children: ReactNode, requireApiScope?: boolean}) {
    const { data: session, status } = useSession()
    const content = status === 'loading' ? <Loading />
        : status === 'unauthenticated' ? <LoginRequired />
        : requireApiScope && session?.olimanagerApiReady !== true ? <ApiScopeRequired expired={session?.olimanagerApiScope === true} />
        : children
    return <div className="page-wrapper">
        <ApolloProviderClient>
            <BreadcrumbsProvider>
                <NavBar />
                <div className="page-content">
                    {content}
                </div>
            </BreadcrumbsProvider>
        </ApolloProviderClient>
    </div>
}
