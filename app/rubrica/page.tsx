"use client"
import { Suspense } from 'react'
import Page from '@/app/components/Page'
import Loading from '@/app/components/Loading'
import OlimanagerAddressBook from '@/app/components/OlimanagerAddressBook'

export default function AddressBookPage() {
    // OlimanagerAddressBook legge il distretto dall'URL con useSearchParams
    return <Page>
        <Suspense fallback={<Loading />}>
            <OlimanagerAddressBook />
        </Suspense>
    </Page>
}
