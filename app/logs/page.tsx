"use client"
import Page from '@/app/components/Page'
import { PageBreadcrumb } from '@/app/components/BreadcrumbsProvider'
import AppLogs from '@/app/components/AppLogs'

export default function LogsPage() {
    return <Page>
        <PageBreadcrumb label="logs" title="log applicativi" />
        <AppLogs />
    </Page>
}
