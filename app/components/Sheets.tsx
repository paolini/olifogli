import { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import { Input } from '@/app/components/Input'
import useProfile from '../lib/useProfile'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { useGetSheetsQuery, useAddSheetMutation, Sheet, useDeleteSheetMutation, useDeleteWorkbookMutation, useDeleteSheetsMutation } from '../graphql/generated';
import Link from 'next/link';
import SchoolSheetsCreation from './SchoolSheetsCreation';
import { useRouter } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
const _ = gql`query GetSheets($workbookId: ObjectId!) {
        sheets(workbookId: $workbookId) {
            _id
            name
            schema
            commonData
            permittedEmails
            permittedIds
            nRows
            ownerId
        }
    }
`

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
const __ = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!, $permittedEmails: [String!]!) {
        addSheet(name: $name, schema: $schema, workbookId: $workbookId, permittedEmails: $permittedEmails) 
    }
`

const ___ = gql`
    mutation DeleteSheets($ids: [ObjectId!]!) {
        deleteSheets(ids: $ids)
    }
`

export default function Sheets({ workbookId }: { workbookId: ObjectId }) {
    const profile = useProfile()
    return <div className="p-4">
        <h1>Fogli</h1>
        {profile && <SheetsTable workbookId={workbookId} profile={profile}/>}
        {profile?.isAdmin && <SheetForm workbookId={workbookId} />}
    </div>;
}

function SheetsTable({ workbookId, profile }: { 
    workbookId: ObjectId
    profile?: { isAdmin: boolean }
}) {
    const router = useRouter()
    const [creationId, setCreationId] = useState<ObjectId|null>(null)
    const { loading, error, data, refetch } = useGetSheetsQuery({
        variables: { workbookId }
    })
    const [deleteSheets, {loading: deletingSheets, error: deleteSheetsError }] = useDeleteSheetsMutation()
    const [deleteWorkbook, { loading: deletingWorkbook, error: deleteWorkbookError }] = useDeleteWorkbookMutation({
          refetchQueries: ['GetWorkbooks']
        })
    

    if (loading) return <Loading />;
    if (error) return <Error error={error.message} />;
    if (!data) return <div>No data</div>;
    const sheets = data.sheets ?? [];

    const emptySheetIds = sheets.filter((s:Sheet) => s.nRows === 0).map(s => s._id)

    if (sheets.length === 0) return <div className="bg-alert">Nessun foglio disponibile</div>

    return <>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Schema</th>
                    <th>dati comuni</th>
                    <th>righe</th>
                    <th>email autorizzati</th>
                    <td>id autorizzati</td>
                </tr>
            </thead>
            <tbody>
                {sheets.map(sheet => (
                    sheet && <SheetRow key={sheet._id?.toString()} sheet={sheet} creationDisabled={creationId !== null} startCreation={sheetId => setCreationId(sheetId)} />
                ))}
            </tbody>
        </table>
        <Error error={deleteWorkbookError} />
        <Error error={deleteSheetsError} />
        { profile?.isAdmin && 
            <div className="flex items-center gap-3 my-2">
                <Button variant="danger" disabled={emptySheetIds.length === 0 || deletingSheets} onClick={deleteEmptySheets}>
                    Elimina {emptySheetIds.length} {emptySheetIds.length === 1 ? 'foglio vuoto' : 'fogli vuoti'}
                </Button> 
                <Button variant="danger" disabled={sheets.length > 0 || deletingWorkbook} onClick={onDelete}>
                    Elimina blocco
                </Button>
          </div>
        }

        {creationId && <SchoolSheetsCreation sheetId={creationId} workbookId={workbookId} done={() => {setCreationId(null);refetch()}} />}
    </>

    async function deleteEmptySheets() {
      if (!confirm(`Sei sicuro di voler eliminare ${emptySheetIds.length} fogli vuoti?`)) return
      await deleteSheets({ variables: { ids: emptySheetIds } })
      refetch() 
    }

    async function onDelete() {
      await deleteWorkbook({ variables: { _id: workbookId } })
      router.back()
    }

}

function SheetRow({sheet, creationDisabled, startCreation}: {
    sheet: Sheet, 
    creationDisabled: boolean, 
    startCreation: (id: ObjectId) => void
}) {
    return <tr key={sheet._id?.toString()}>
        <td>
            <Link href={`/sheet/${sheet._id}`}>{sheet.name}</Link>
        </td>
        <td>
            {sheet.schema && schemas[sheet.schema].header}
        </td>
        <td>{JSON.stringify(sheet.commonData)}</td>
        <td>{sheet.nRows}</td>
        <td>{sheet.permittedEmails.join(' - ')}</td>
        { sheet.schema === 'scuole' && <td><Button disabled={creationDisabled} onClick={() => startCreation(sheet._id)}>crea fogli scuole</Button></td>} 
    </tr>
}

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
        <Input value={name} setValue={setName}/> {}
        <Button disabled={loading||schema==""||name==""} onClick={create}>
            Nuovo foglio
        </Button>
    </div>

    async function create() {
        await addSheet({variables: {
            name,
            schema: schema,
            workbookId,
            permittedEmails: []
        }})
        setName('')
        setSchema('')
    }
}