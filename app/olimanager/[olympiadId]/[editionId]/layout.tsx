"use client"
import type { ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Page from '@/app/components/Page'
import OlimanagerAddressBook from '@/app/components/OlimanagerAddressBook'

// La rubrica sta nel layout dell'edizione, non nelle pagine: così resta montata
// passando dall'elenco dei distretti a un distretto e ritorno, con i dati
// caricati e i filtri. Le pagine (elenco e distretto) non disegnano nulla.
export default function OlimanagerEditionLayout({ children }: { children: ReactNode }) {
    const { olympiadId, editionId, district } = useParams<{ olympiadId: string, editionId: string, district?: string }>()
    return <Page>
        <OlimanagerAddressBook olympiadId={decodeURIComponent(olympiadId)} editionId={decodeURIComponent(editionId)}
            district={district === undefined ? undefined : decodeURIComponent(district)} />
        {children}
    </Page>
}
