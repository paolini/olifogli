'use client'
import { gql } from '@apollo/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOlimanagerVenueSheetChoicesQuery, useOlimanagerAddressBookLazyQuery, useOlimanagerAddressBookSelectionQuery } from '../graphql/generated'
import { ADDRESS_BOOK_ROLES, districtKey, type AddressBookRole } from '../lib/addressBookEntries'
import useProfile from '../lib/useProfile'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'
import AddressBookDistrict from './AddressBookDistrict'
import AddressBookDistricts from './AddressBookDistricts'
import { Warnings } from './AddressBookParts'
import { useBreadcrumbs } from './BreadcrumbsProvider'

const ADDRESS_BOOK = gql`
    query OlimanagerAddressBook($olympiadId: String!, $editionId: String!) {
        olimanagerAddressBook(olympiadId: $olympiadId, editionId: $editionId) {
            districts {
                id name
                coordinators { name surname email }
                admins { name surname email }
                sheets { _id name label nRows nValidRows closed locked }
                warnings
                schools { code name city province contact { name surname email } sheets { _id name label nRows nValidRows closed locked } }
            }
            warnings
        }
    }
`

// The whole site is about the math olympiads: the year is enough.
const editionLabel = (edition: { name: string, year?: number | null }) => edition.year ? String(edition.year) : edition.name

export const addressBookHref = (editionId: string, districtKey?: string) =>
    `/rubrica?edizione=${encodeURIComponent(editionId)}${districtKey ? `&distretto=${encodeURIComponent(districtKey)}` : ''}`

const SELECTION = gql`
    query OlimanagerAddressBookSelection {
        olimanagerAddressBookSelection { olympiadId editionId }
    }
`

// The edition and the district are in the URL (`?edizione=…&distretto=…`), so
// links and the back button work; without an edition the page goes to the last
// one the user loaded. Edition and district are shown in the header breadcrumbs,
// where «Rubrica» leads to the choice of the edition (`?scegli`).
const CHOOSE_HREF = '/rubrica?scegli'

export default function OlimanagerAddressBook() {
    const profile = useProfile()
    const router = useRouter()
    const searchParams = useSearchParams()
    const editionParam = searchParams.get('edizione')
    const districtParam = searchParams.get('distretto')
    const choosing = searchParams.has('scegli')
    const { setBreadcrumbs } = useBreadcrumbs()
    const choices = useOlimanagerVenueSheetChoicesQuery({ skip: !profile })
    const selection = useOlimanagerAddressBookSelectionQuery({ skip: !profile, fetchPolicy: 'network-only' })
    const [load, addressBook] = useOlimanagerAddressBookLazyQuery({ fetchPolicy: 'network-only' })
    // Filters kept here so that they survive going into a district and back.
    const [roles, setRoles] = useState<Set<AddressBookRole>>(new Set(ADDRESS_BOOK_ROLES))
    const [districtFilter, setDistrictFilter] = useState('')
    const [peopleSearch, setPeopleSearch] = useState('')
    type Selection = { olympiadId: string, editionId: string }
    const [picked, setPicked] = useState<Selection | null>(null)

    const olympiads = useMemo(() => choices.data?.olimanagerVenueSheetChoices || [], [choices.data])
    const findEdition = useMemo(() => (editionId: string | null | undefined) => {
        for (const olympiad of olympiads) {
            const edition = olympiad.editions.find(e => e.id === editionId)
            if (edition) return { olympiadId: olympiad.id, editionId: edition.id, label: editionLabel(edition) }
        }
        return null
    }, [olympiads])
    const current = findEdition(editionParam)
    const saved = findEdition(selection.data?.olimanagerAddressBookSelection?.editionId)
    const districts = addressBook.data?.olimanagerAddressBook.districts
    // Whoever sees a single district goes straight into it.
    const openDistrict = districts?.length === 1 ? districts[0] : districts?.find(d => districtKey(d) === districtParam)

    // Effects depend on strings only: current and saved are new objects at every render.
    const currentOlympiadId = current?.olympiadId
    const currentEditionId = current?.editionId
    const savedEditionId = saved?.editionId

    // Without an edition in the URL, go to the saved one if Olimanager still lists it.
    useEffect(() => {
        if (!editionParam && !choosing && savedEditionId) router.replace(addressBookHref(savedEditionId))
    }, [editionParam, choosing, savedEditionId, router])

    // Load the edition of the URL whenever it changes.
    const loaded = useRef('')
    useEffect(() => {
        if (!currentOlympiadId || !currentEditionId || loaded.current === currentEditionId) return
        loaded.current = currentEditionId
        void load({ variables: { olympiadId: currentOlympiadId, editionId: currentEditionId } })
    }, [currentOlympiadId, currentEditionId, load])

    const editionCrumb = current?.label
    const districtCrumb = openDistrict && districts && districts.length > 1 ? openDistrict.name : undefined
    useEffect(() => {
        setBreadcrumbs([
            currentEditionId ? { label: 'Rubrica', href: CHOOSE_HREF, title: 'Cambia edizione' } : { label: 'Rubrica' },
            ...(editionCrumb && currentEditionId ? [{ label: editionCrumb, href: districtCrumb ? addressBookHref(currentEditionId) : undefined }] : []),
            ...(districtCrumb ? [{ label: districtCrumb }] : []),
        ])
    }, [editionCrumb, districtCrumb, currentEditionId, setBreadcrumbs])
    useEffect(() => () => setBreadcrumbs([]), [setBreadcrumbs])

    if (!profile || choices.loading || selection.loading) return <Loading />
    // Waiting for the redirect to the saved edition.
    if (!editionParam && !choosing && saved) return <Loading />

    // Also after a failed load, so that another edition can be chosen.
    const showSelects = !current || !!addressBook.error
    // The selects start from the edition being shown or, when choosing, the saved one.
    const { olympiadId, editionId } = picked || current || saved || { olympiadId: '', editionId: '' }
    const editions = olympiads.find(o => o.id === olympiadId)?.editions || []
    const warnings = addressBook.data?.olimanagerAddressBook.warnings || []
    // For other users a school without links may just be a sheet they cannot access.
    const seesAllSheets = profile.isAdmin || profile.isSupervisor
    const hasSheets = (districts || []).some(d => d.sheets.length || d.schools.some(s => s.sheets.length))

    return <div className="space-y-3 p-2">
        <Error error={choices.error || selection.error || addressBook.error} />
        {showSelects && <>
            <p>Coordinatori distrettuali (CD), responsabili di distretto (RD) e referenti di istituto (RI) delle scuole con iscrizione valida all’edizione, letti da Olimanager: compaiono solo i contatti che Olimanager ti permette di vedere, e solo i fogli a cui hai accesso.</p>
            {editionParam && !current && <Error error="Edizione non trovata in Olimanager." />}
            <div className="flex flex-wrap items-center gap-3">
                <label>Olimpiade <select value={olympiadId} onChange={e => setPicked({ olympiadId: e.target.value, editionId: '' })}>
                    <option value="">Seleziona olimpiade</option>
                    {olympiads.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select></label>
                <label>Edizione <select disabled={!olympiadId} value={editionId} onChange={e => setPicked({ olympiadId, editionId: e.target.value })}>
                    <option value="">Seleziona edizione</option>
                    {editions.map(e => <option key={e.id} value={e.id}>{editionLabel(e)}</option>)}
                </select></label>
                <Button disabled={!olympiadId || !editionId} onClick={() => {
                    setPicked(null)
                    router.push(addressBookHref(editionId))
                }}>Carica rubrica</Button>
                {choosing && saved && <Link className="text-blue-600 hover:underline" href={addressBookHref(saved.editionId)}>Annulla</Link>}
            </div>
        </>}
        {current && addressBook.loading && <Loading />}
        {current && districts && !addressBook.loading && <>
            <Warnings warnings={warnings} />
            {!hasSheets && <p>Nessun foglio Olifogli {seesAllSheets ? '' : 'a cui hai accesso '}per i contest di questa edizione.</p>}
            {!districts.length ? <p>Olimanager non ti mostra nessun contatto per questa edizione.</p>
                : openDistrict ? <AddressBookDistrict key={districtKey(openDistrict)} district={openDistrict} roles={roles} setRoles={setRoles}
                    markMissingSheets={hasSheets && seesAllSheets} />
                : <AddressBookDistricts districts={districts} roles={roles} setRoles={setRoles}
                    districtHref={district => addressBookHref(current.editionId, districtKey(district))}
                    districtFilter={districtFilter} setDistrictFilter={setDistrictFilter}
                    peopleSearch={peopleSearch} setPeopleSearch={setPeopleSearch} />}
        </>}
    </div>
}
