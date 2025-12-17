'use client'

import { ObjectId } from 'bson'
import Sheets from '@/app/components/Sheets'
import { useAddSheetMutation, useGetSheetsQuery } from '../graphql/generated'
import Loading from './Loading'
import Error from './Error'
import { gql } from 'graphql-tag'
import { useState } from 'react'
import { schemas } from '../lib/schema'
import Button from './Button'

const _ = gql`query GetSheets($workbookId: ObjectId) {
        sheets(workbookId: $workbookId) {
            _id
            name
            schema
            commonData
            permissions {
                email
                userId
                role
            }
            updatedAt
            nRows
            nValidRows
            nSyncedRows
            anomalies
            closed
            locked
            ownerId
        }
    }
`

export default function WorkbookSheets({ workbookId, profile }: { 
    workbookId: ObjectId, profile?: { isAdmin?: boolean|null } | null
}) {
    const { loading, error, data, refetch } = useGetSheetsQuery({
        variables: { workbookId },
        pollInterval: 10000 // millisecondi
    })

    if (loading) return <Loading />
    if (error) return <Error error={error.message} />
    if (!data) return <div>No data</div>

    return <div className="p-4">
        <Sheets sheets={data.sheets} profile={profile} workbookId={workbookId} refetch={refetch} />
        {workbookId && profile?.isAdmin && <SheetForm workbookId={workbookId} />}
    </div>
}

const __ = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!, $permissions: [PermissionInput!]) {
        addSheet(name: $name, schema: $schema, workbookId: $workbookId, permissions: $permissions) 
    }
`

function SheetForm({ workbookId }: { workbookId: ObjectId }) {
    const [addSheet, {loading, error }] = useAddSheetMutation({
        refetchQueries: ['GetSheets']
    });
    const [name, setName] = useState('')
    const [schema, setSchema] = useState('')

    if (error) return <Error error={error.message} />;

    return <div>
        <select name="schema" value={schema} onChange={e => setSchema(e.target.value)}>
            <option value="">Scegli uno schema</option>
            { Object.entries(schemas).map(([key, schema]) =>
                <option key={key} value={key}>{schema.header}</option>
            )}
        </select> {}
        <input value={name} onChange={e => setName(e.target.value)} /> {}
        <Button disabled={loading||schema==""||name==""} onClick={create}>
            ⚙ Nuovo foglio
        </Button>
    </div>

    async function create() {
        await addSheet({variables: {
            name,
            schema: schema,
            workbookId,
            permissions: []
        }})
        setName('')
        setSchema('')
    }
}
