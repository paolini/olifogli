'use client'

import { ObjectId } from 'bson'
import Sheets from '@/app/components/Sheets'
import { useGetSheetsQuery } from '../graphql/generated'
import Loading from './Loading'
import Error from './Error'
import { gql } from 'graphql-tag'
import { useWorkbookUpdated } from './useWorkbookUpdated'
import { useState } from 'react'
import Button from './Button'
import OlimanagerVenueSheetsCreation from './OlimanagerVenueSheetsCreation'

const _ = gql`query GetSheets($workbookId: ObjectId) {
        sheets(workbookId: $workbookId) {
            _id
            name
            schema
            commonData
            permissions {
                email
                role
            }
            updatedAt
            nRows
            nValidRows
            nSyncedRows
            anomalies
            nScanJobs
            nScanSheetJobs
            closed
            locked
        }
    }
`

export default function WorkbookSheets({ workbookId, profile }: { 
    workbookId: ObjectId, profile?: { isAdmin?: boolean|null } | null
}) {
    const [creating, setCreating] = useState(false)
    const { loading, error, data, refetch } = useGetSheetsQuery({
        variables: { workbookId },
    })

    useWorkbookUpdated(workbookId, () => { refetch() })

    if (loading) return <Loading />
    if (error) return <Error error={error.message} />
    if (!data) return <div>No data</div>

    if (creating && profile?.isAdmin) return <OlimanagerVenueSheetsCreation workbookId={workbookId} done={() => { setCreating(false); refetch() }} />

    return <div className="p-4">
        <Sheets sheets={data.sheets} profile={profile} workbookId={workbookId} refetch={refetch} />
        {profile?.isAdmin && <Button className="mt-4" onClick={() => setCreating(true)}>⚙ Crea fogli da Olimanager</Button>}
    </div>
}

