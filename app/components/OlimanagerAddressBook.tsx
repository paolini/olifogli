'use client'
import { gql } from '@apollo/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useOlimanagerVenueSheetChoicesQuery, useOlimanagerAddressBookLazyQuery, useOlimanagerAddressBookSelectionQuery } from '../graphql/generated'
import { ADDRESS_BOOK_ROLES, districtKey, type AddressBookRole } from '../lib/addressBookEntries'
import useProfile from '../lib/useProfile'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'
import AddressBookDistrict from './AddressBookDistrict'
import AddressBookDistricts from './AddressBookDistricts'
import { Warnings } from './AddressBookParts'

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

const SELECTION = gql`
    query OlimanagerAddressBookSelection {
        olimanagerAddressBookSelection { olympiadId editionId }
    }
`

export default function OlimanagerAddressBook() {
    const profile = useProfile()
    const choices = useOlimanagerVenueSheetChoicesQuery({ skip: !profile })
    const selection = useOlimanagerAddressBookSelectionQuery({ skip: !profile, fetchPolicy: 'network-only' })
    const [load, addressBook] = useOlimanagerAddressBookLazyQuery({ fetchPolicy: 'network-only' })
    type Selection = { olympiadId: string, editionId: string }
    // Until the user picks something, the selection is the last edition consulted, if Olimanager still lists it.
    const [picked, setPicked] = useState<Selection | null>(null)
    const saved = useMemo(() => {
        const last = selection.data?.olimanagerAddressBookSelection
        return last && choices.data?.olimanagerVenueSheetChoices.find(o => o.id === last.olympiadId)?.editions.some(e => e.id === last.editionId)
            ? { olympiadId: last.olympiadId, editionId: last.editionId } : null
    }, [selection.data, choices.data])
    const { olympiadId, editionId } = picked || saved || { olympiadId: '', editionId: '' }
    // Filters kept here so that they survive going into a district and back.
    const [roles, setRoles] = useState<Set<AddressBookRole>>(new Set(ADDRESS_BOOK_ROLES))
    const [districtFilter, setDistrictFilter] = useState('')
    const [peopleSearch, setPeopleSearch] = useState('')
    const districtParam = useSearchParams().get('distretto')
    // Once an edition is loaded (or loading) the selects are hidden until «Cambia edizione».
    const [changing, setChanging] = useState(false)

    const districts = addressBook.data?.olimanagerAddressBook.districts

    // Load the saved edition as soon as it is known, once.
    const restored = useRef(false)
    useEffect(() => {
        if (restored.current || !saved) return
        restored.current = true
        void load({ variables: saved })
    }, [saved, load])

    if (!profile) return <Loading />
    if (choices.loading || selection.loading) return <Loading />

    const olympiads = choices.data?.olimanagerVenueSheetChoices || []
    const editions = olympiads.find(o => o.id === olympiadId)?.editions || []
    const warnings = addressBook.data?.olimanagerAddressBook.warnings || []
    const current = addressBook.loading || addressBook.data ? addressBook.variables : undefined
    const currentEdition = olympiads.find(o => o.id === current?.olympiadId)?.editions.find(e => e.id === current?.editionId)
    const showSelects = changing || !currentEdition
    const editionLabel = (e: { name: string, year?: number | null }) => `${e.name}${e.year ? ` (${e.year})` : ''}`
    // For other users a school without links may just be a sheet they cannot access.
    const seesAllSheets = profile.isAdmin || profile.isSupervisor
    const hasSheets = (districts || []).some(d => d.sheets.length || d.schools.some(s => s.sheets.length))
    // Whoever sees a single district goes straight into it.
    const openDistrict = districts?.length === 1 ? districts[0] : districts?.find(d => districtKey(d) === districtParam)

    return <div className="space-y-3 p-2">
        <h1 className="text-xl font-bold">Rubrica di CD, RD e RI</h1>
        <p>Coordinatori distrettuali (CD), responsabili di distretto (RD) e referenti di istituto (RI) delle scuole con iscrizione valida all’edizione, letti da Olimanager: compaiono solo i contatti che Olimanager ti permette di vedere, e solo i fogli a cui hai accesso.</p>
        <Error error={choices.error || selection.error || addressBook.error} />
        {!showSelects && <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold">{editionLabel(currentEdition)}</h2>
            <Button variant="secondary" onClick={() => setChanging(true)}>Cambia edizione</Button>
        </div>}
        {showSelects && <div className="flex flex-wrap items-center gap-3">
            <label>Olimpiade <select value={olympiadId} onChange={e => setPicked({ olympiadId: e.target.value, editionId: '' })}>
                <option value="">Seleziona olimpiade</option>
                {olympiads.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>
            <label>Edizione <select disabled={!olympiadId} value={editionId} onChange={e => setPicked({ olympiadId, editionId: e.target.value })}>
                <option value="">Seleziona edizione</option>
                {editions.map(e => <option key={e.id} value={e.id}>{editionLabel(e)}</option>)}
            </select></label>
            <Button disabled={!olympiadId || !editionId || addressBook.loading} onClick={async () => {
                setChanging(false)
                await load({ variables: { olympiadId, editionId } })
            }}>Carica rubrica</Button>
            {changing && currentEdition && <Button variant="secondary" onClick={() => {
                setPicked(current ?? null)
                setChanging(false)
            }}>Annulla</Button>}
        </div>}
        {addressBook.loading && <Loading />}
        {districts && !addressBook.loading && <>
            <Warnings warnings={warnings} />
            {!hasSheets && <p>Nessun foglio Olifogli {seesAllSheets ? '' : 'a cui hai accesso '}per i contest di questa edizione.</p>}
            {!districts.length ? <p>Olimanager non ti mostra nessun contatto per questa edizione.</p>
                : openDistrict ? <AddressBookDistrict key={districtKey(openDistrict)} district={openDistrict} roles={roles} setRoles={setRoles}
                    showBack={districts.length > 1} markMissingSheets={hasSheets && seesAllSheets} />
                : <AddressBookDistricts districts={districts} roles={roles} setRoles={setRoles}
                    districtFilter={districtFilter} setDistrictFilter={setDistrictFilter}
                    peopleSearch={peopleSearch} setPeopleSearch={setPeopleSearch} />}
        </>}
    </div>
}
