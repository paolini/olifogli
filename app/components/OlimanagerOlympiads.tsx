'use client'
import { gql } from '@apollo/client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useOlimanagerOlympiadsQuery } from '../graphql/generated'
import { useBreadcrumbs } from './BreadcrumbsProvider'
import { OlimanagerLogin } from './LoginForm'
import Error from './Error'
import Loading from './Loading'

// Olimanager pages: /olimanager/<olympiad> lists the editions,
// /olimanager/<olympiad>/<edition>[/<district>] is the address book.
// Olympiads are named by their id (e.g. «olimat»), short and mnemonic.

const OLYMPIADS = gql`
    query OlimanagerOlympiads {
        olimanagerOlympiads { id name editions { id name year } }
    }
`

export const olympiadHref = (olympiadId: string) => `/olimanager/${encodeURIComponent(olympiadId)}`
export const editionHref = (olympiadId: string, editionId: string) => `${olympiadHref(olympiadId)}/${encodeURIComponent(editionId)}`
// The whole site is about the math olympiads: the year is enough.
export const editionLabel = (edition: { name: string, year?: number | null }) => edition.year ? String(edition.year) : edition.name

export function useOlympiads() {
    return useOlimanagerOlympiadsQuery()
}

// Home page section: the olympiads when Olimanager can be read (ready: a valid
// token with the api scope), otherwise how to log in to read it.
export function OlimanagerOlympiads({ ready, expired }: { ready: boolean, expired: boolean }) {
    return <div className="p-4 space-y-4">
        <h1>Olimanager</h1>
        {ready ? <OlympiadsTable />
            : <OlimanagerLogin expired={expired} intro="Per vedere i dati di Olimanager (rubrica di CD, RD e RI)." />}
    </div>
}

function OlympiadsTable() {
    const { data, loading, error } = useOlympiads()
    return <>
        {loading && <Loading />}
        <Error error={error} />
        {data && <table className="table-auto">
            <thead><tr className="border-b">
                <th className="text-left p-2 pr-8">Olimpiade</th>
                <th className="text-left p-2">Sigla</th>
            </tr></thead>
            <tbody>{data.olimanagerOlympiads.map(olympiad => <tr key={olympiad.id}>
                <td className="p-2 pr-8"><Link href={olympiadHref(olympiad.id)} className="text-blue-600 hover:text-blue-800">{olympiad.name}</Link></td>
                <td className="p-2 text-gray-600 font-mono">{olympiad.id}</td>
            </tr>)}</tbody>
        </table>}
    </>
}

// The editions of an olympiad, latest first.
export function OlimanagerEditions({ olympiadId }: { olympiadId: string }) {
    const { data, loading, error } = useOlympiads()
    const { setBreadcrumbs } = useBreadcrumbs()
    const olympiad = data?.olimanagerOlympiads.find(o => o.id === olympiadId)
    const olympiadName = olympiad?.name
    useEffect(() => {
        setBreadcrumbs([{ label: olympiadId, title: olympiadName }])
        return () => setBreadcrumbs([])
    }, [olympiadId, olympiadName, setBreadcrumbs])

    if (loading) return <Loading />
    if (error) return <div className="p-2"><Error error={error} /></div>
    if (!olympiad) return <div className="p-2"><Error error="Olimpiade non trovata in Olimanager." /></div>
    const editions = [...olympiad.editions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    return <div className="p-2 space-y-3">
        <p>Scegli l’edizione per la rubrica di coordinatori distrettuali (CD), responsabili di distretto (RD) e referenti di istituto (RI), con i fogli Olifogli dell’edizione.</p>
        <table className="table-auto">
            <thead><tr className="border-b">
                <th className="text-left p-2 pr-8">Edizione</th>
                <th className="text-left p-2">Nome</th>
            </tr></thead>
            <tbody>{editions.map(edition => <tr key={edition.id}>
                <td className="p-2 pr-8"><Link href={editionHref(olympiad.id, edition.id)} className="text-blue-600 hover:text-blue-800">{editionLabel(edition)}</Link></td>
                <td className="p-2 text-gray-600">{edition.name}</td>
            </tr>)}</tbody>
        </table>
        {!editions.length && <p>Nessuna edizione.</p>}
    </div>
}
