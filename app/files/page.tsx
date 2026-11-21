"use client"
import { Suspense } from 'react'
import Page from '@/app/components/Page'
import Loading from '@/app/components/Loading'
import WorkerFiles from '@/app/components/WorkerFiles'

export default function FilesPage() {
    // WorkerFiles legge la posizione dall'URL con useSearchParams
    return <Page>
        <Suspense fallback={<Loading />}>
            <WorkerFiles />
        </Suspense>
    </Page>
}
