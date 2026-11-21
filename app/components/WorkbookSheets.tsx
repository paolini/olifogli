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
import OlimanagerParticipantImport from './OlimanagerParticipantImport'
import SheetFormNew from './SheetFormNew'

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
    const [importing, setImporting] = useState(false)
    const { loading, error, data, refetch } = useGetSheetsQuery({
        variables: { workbookId },
    })

    useWorkbookUpdated(workbookId, () => { refetch() })

    if (loading) return <Loading />
    if (error) return <Error error={error.message} />
    if (!data) return <div>No data</div>

    if (creating && profile?.isAdmin) return <OlimanagerVenueSheetsCreation workbookId={workbookId} done={() => { setCreating(false); refetch() }} />
    if (importing && profile?.isAdmin) return <OlimanagerParticipantImport workbookId={workbookId} done={() => { setImporting(false); refetch() }} />

    return <div className="p-4">
        <Sheets sheets={data.sheets} profile={profile} workbookId={workbookId} refetch={refetch} adminActions={<>
            <SheetFormNew workbookId={workbookId} />
            <Button onClick={() => setCreating(true)}>⚙ Crea fogli da Olimanager</Button>
            <Button onClick={() => setImporting(true)}>⇩ Importa partecipanti da Olimanager</Button>
        </>} />
    </div>
}

