"use client"
import { useParams } from 'next/navigation'
import Page from '@/app/components/Page'
import { OlimanagerEditions } from '@/app/components/OlimanagerOlympiads'

export default function OlimanagerOlympiadPage() {
    const { olympiadId } = useParams<{ olympiadId: string }>()
    return <Page>
        <OlimanagerEditions olympiadId={decodeURIComponent(olympiadId)} />
    </Page>
}
