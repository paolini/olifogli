'use client'
import { gql } from '@apollo/client'
import { useEffect, useState } from 'react'
import { useOlimanagerAddressBookQuery } from '../graphql/generated'
import { ADDRESS_BOOK_ROLES, districtKey, type AddressBookRole } from '../lib/addressBookEntries'
import useProfile from '../lib/useProfile'
import Error from './Error'
import Loading from './Loading'
import AddressBookDistrict from './AddressBookDistrict'
import AddressBookDistricts from './AddressBookDistricts'
import { Warnings } from './AddressBookParts'
import { useBreadcrumbs } from './BreadcrumbsProvider'
import { editionHref, editionLabel, olympiadHref, useOlympiads } from './OlimanagerOlympiads'

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

// Address book of an edition: the district list at /olimanager/<olympiad>/<edition>,
// a district at …/<edition>/<district>. It is rendered by the edition layout, so
// the loaded data and the filters survive going into a district and back.
// Olympiad, edition and district are shown in the header breadcrumbs.
export default function OlimanagerAddressBook({ olympiadId, editionId, district: districtParam }: {
    olympiadId: string, editionId: string, district?: string
}) {
    const profile = useProfile()
    const { setBreadcrumbs } = useBreadcrumbs()
    const olympiads = useOlympiads()
    // Cached data shows at once when coming back to the edition, then it is refreshed.
    const addressBook = useOlimanagerAddressBookQuery({ variables: { olympiadId, editionId }, fetchPolicy: 'cache-and-network' })
    const [roles, setRoles] = useState<Set<AddressBookRole>>(new Set(ADDRESS_BOOK_ROLES))
    const [districtFilter, setDistrictFilter] = useState('')
    const [peopleSearch, setPeopleSearch] = useState('')

    const olympiad = olympiads.data?.olimanagerOlympiads.find(o => o.id === olympiadId)
    const edition = olympiad?.editions.find(e => e.id === editionId)
    const districts = addressBook.data?.olimanagerAddressBook.districts
    // Whoever sees a single district goes straight into it.
    const openDistrict = districts?.length === 1 ? districts[0] : districts?.find(d => districtKey(d) === districtParam)

    const olympiadName = olympiad?.name
    const editionCrumb = edition ? editionLabel(edition) : editionId
    const districtCrumb = openDistrict && districts && districts.length > 1 ? openDistrict.name : undefined
    useEffect(() => {
        setBreadcrumbs([
            { label: olympiadId, href: olympiadHref(olympiadId), title: olympiadName },
            { label: editionCrumb, href: districtCrumb ? editionHref(olympiadId, editionId) : undefined },
            ...(districtCrumb ? [{ label: districtCrumb }] : []),
        ])
    }, [olympiadId, olympiadName, editionId, editionCrumb, districtCrumb, setBreadcrumbs])
    useEffect(() => () => setBreadcrumbs([]), [setBreadcrumbs])

    if (!profile || (addressBook.loading && !districts)) return <Loading />
    if (addressBook.error || !districts) return <div className="p-2"><Error error={addressBook.error} /></div>

    const warnings = addressBook.data?.olimanagerAddressBook.warnings || []
    // For other users a school without links may just be a sheet they cannot access.
    const seesAllSheets = profile.isAdmin || profile.isSupervisor
    const hasSheets = districts.some(d => d.sheets.length || d.schools.some(s => s.sheets.length))

    return <div className="space-y-3 p-2">
        <Warnings warnings={warnings} />
        {!hasSheets && <p>Nessun foglio Olifogli {seesAllSheets ? '' : 'a cui hai accesso '}per i contest di questa edizione.</p>}
        {!districts.length ? <p>Olimanager non ti mostra nessun contatto per questa edizione.</p>
            : openDistrict ? <AddressBookDistrict key={districtKey(openDistrict)} district={openDistrict} roles={roles} setRoles={setRoles}
                markMissingSheets={hasSheets && seesAllSheets} />
            : <AddressBookDistricts districts={districts} roles={roles} setRoles={setRoles}
                districtHref={d => `${editionHref(olympiadId, editionId)}/${encodeURIComponent(districtKey(d))}`}
                districtFilter={districtFilter} setDistrictFilter={setDistrictFilter}
                peopleSearch={peopleSearch} setPeopleSearch={setPeopleSearch} />}
    </div>
}
