"use client"
import Page from '@/app/components/Page'
import { PageBreadcrumb } from '@/app/components/BreadcrumbsProvider'
import Users from '@/app/components/Users'

export default function UsersPage() {
    return <Page>
        <PageBreadcrumb label="utenti" />
        <div className="p-4"><Users /></div>
    </Page>
}
