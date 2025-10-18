import { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import { Input } from '@/app/components/Input'
import useProfile from '../lib/useProfile'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { useGetSheetsQuery, useAddSheetMutation, Sheet, useDeleteSheetsMutation } from '../graphql/generated';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import SchoolSheetsCreation from './SchoolSheetsCreation';
import { useRouter } from 'next/navigation';

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
            nRows
            ownerId
        }
    }
`

const __ = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!, $permissions: [PermissionInput!]) {
        addSheet(name: $name, schema: $schema, workbookId: $workbookId, permissions: $permissions) 
    }
`

const ___ = gql`
    mutation DeleteSheets($ids: [ObjectId!]!) {
        deleteSheets(ids: $ids)
    }
`

const DELETE_WORKBOOK = gql`
    mutation DeleteWorkbook($_id: ObjectId!) {
        deleteWorkbook(_id: $_id)
    }
`

export default function Sheets({ workbookId }: { workbookId?: ObjectId }) {
    const profile = useProfile()
    return <div className="p-4">
        {profile && <SheetsTable workbookId={workbookId} profile={profile}/>}
        {workbookId && profile?.isAdmin && <SheetForm workbookId={workbookId} />}
    </div>;
}

function SheetsTable({ workbookId, profile }: { 
    workbookId?: ObjectId
    profile?: { isAdmin: boolean }
}) {
    const router = useRouter()
    const [creationId, setCreationId] = useState<ObjectId|null>(null)
    const { loading, error, data, refetch } = useGetSheetsQuery({
        variables: { workbookId }
    })
    const [deleteSheets, {loading: deletingSheets, error: deleteSheetsError }] = useDeleteSheetsMutation()
    const [deleteWorkbook, { loading: deletingWorkbook, error: deleteWorkbookError }] = useMutation(DELETE_WORKBOOK)
    // Stato per la selezione delle righe
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    // Stato per la paginazione
    const [displayLimit, setDisplayLimit] = useState(20)
    // Stato per il filtro schema
    const [schemaFilter, setSchemaFilter] = useState<string>('')

    if (loading) return <Loading />;
    if (error) return <Error error={error.message} />;
    if (!data) return <div>No data</div>;
    const allSheets = data.sheets ?? [];
    const sheets = schemaFilter 
        ? allSheets.filter(s => s.schema === schemaFilter)
        : allSheets;
    const displayedSheets = sheets.slice(0, displayLimit);
    const hasMore = sheets.length > displayLimit;

    const emptySheetIds = sheets.filter((s:Partial<Sheet>) => s.nRows === 0).map(s => s._id)
    const commonDataHeaders = displayedSheets.reduce((acc, sheet) => {
        if (sheet.commonData) {
            Object.keys(sheet.commonData).forEach(key => {
                if (!acc.includes(key)) acc.push(key)
            })
        }
        return acc;
    }, [] as string[])

    // Gestione selezione
    const allSelected = selectedIds.length === sheets.length && sheets.length > 0;
    const toggleAll = () => {
        if (allSelected) setSelectedIds([])
        else setSelectedIds(sheets.map(s => s._id.toString()))
    }
    const toggleOne = (id: ObjectId) => {
        const idStr = id.toString();
        setSelectedIds(ids => ids.includes(idStr) ? ids.filter(i => i !== idStr) : [...ids, idStr])
    }

    // Calcola gli schemi unici presenti nei fogli
    const availableSchemas = Array.from(new Set(allSheets.map(s => s.schema)))
        .sort()

    return <>
        {allSheets.length === 0 ? (
            <div className="bg-alert">Nessun foglio disponibile</div>
        ) : (
            <>
            <div className="mb-2 flex items-center gap-3">
                <select value={schemaFilter} onChange={e => setSchemaFilter(e.target.value)} className="border rounded px-2 py-1">
                    <option value="">Tutti i fogli</option>
                    {availableSchemas.map(schemaKey => (
                        <option key={schemaKey} value={schemaKey}>
                            {schemas[schemaKey]?.header || schemaKey}
                        </option>
                    ))}
                </select>
                <span>{sheets.length} {sheets.length === 1 ? "foglio" : "fogli"} {schemaFilter && ` (su ${allSheets.length})`}</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>
                            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                        </th>
                        <th>Nome</th>
                        <th>Schema</th>
                        {commonDataHeaders.map(header => <th key={header}>{header.replace('_', ' ')}</th>)}
                        <th>righe</th>
                        <th>permessi</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedSheets.map(sheet => (
                        sheet && (!creationId || sheet._id.toString() === creationId.toString()) &&
                        <SheetRow 
                            key={sheet._id?.toString()} 
                            sheet={sheet} 
                            profile={profile}
                            commonDataHeaders={commonDataHeaders}
                            creationDisabled={creationId !== null} 
                            startCreation={sheetId => setCreationId(sheetId)} 
                            selected={selectedIds.includes(sheet._id.toString())}
                            onSelect={() => toggleOne(sheet._id)}
                        />
                    ))}
                </tbody>
            </table>
            </>
        )}
        {hasMore && (
            <div className="my-2">
                {displayLimit} / {sheets.length} fogli mostrati
                <Button className="ml-2" onClick={() => setDisplayLimit(limit => limit*2)}>
                    Mostra più
                </Button>
                <Button className="ml-2" onClick={() => setDisplayLimit(20)}>
                    Mostra meno
                </Button>
            </div>
        )}
        <Error error={deleteWorkbookError} />
        <Error error={deleteSheetsError} />
        { profile?.isAdmin && 
            <div className="flex items-center gap-3 my-2">
                <Button variant="danger" disabled={emptySheetIds.length === 0 || deletingSheets} onClick={deleteEmptySheets}>
                    Elimina {emptySheetIds.length} {emptySheetIds.length === 1 ? 'foglio vuoto' : 'fogli vuoti'}
                </Button> 
                <Button variant="danger" disabled={selectedIds.length === 0 || deletingSheets} onClick={deleteSelectedSheets}>
                    Elimina {selectedIds.length} {selectedIds.length === 1 ? 'foglio selezionato' : 'fogli selezionati'}
                </Button>
                <Button variant="danger" disabled={sheets.length > 0 || deletingWorkbook} onClick={onDelete}>
                    Elimina raccolta
                </Button>
          </div>
        }

        {creationId && workbookId && <SchoolSheetsCreation sheetId={creationId} workbookId={workbookId} done={() => {setCreationId(null);refetch()}} />}
    </>

    async function deleteEmptySheets() {
      if (!confirm(`Sei sicuro di voler eliminare ${emptySheetIds.length} fogli vuoti?`)) return
      await deleteSheets({ variables: { ids: emptySheetIds } })
      refetch() 
    }

    async function deleteSelectedSheets() {
      if (!confirm(`Sei sicuro di voler eliminare ${selectedIds.length} fogli selezionati?`)) return
      await deleteSheets({ variables: { ids: selectedIds.map(id => new ObjectId(id)) } })
      setSelectedIds([])
      refetch()
    }

    async function onDelete() {
      if (!workbookId) return
      if (!confirm(`Sei sicuro di voler eliminare la raccolta?`)) return
      await deleteWorkbook({ 
        variables: { _id: workbookId },
        refetchQueries: ['GetWorkbooks'],
        awaitRefetchQueries: true
      })
      router.push('/')
    }

}

function SheetRow({sheet, profile, creationDisabled, startCreation, commonDataHeaders, selected, onSelect}: {
    sheet: Partial<Sheet> & {_id: ObjectId}, 
    profile?: {isAdmin: boolean},
    creationDisabled: boolean, 
    startCreation: (id: ObjectId) => void,
    commonDataHeaders: string[],
    selected: boolean,
    onSelect: () => void
}) {
    return <tr key={sheet._id?.toString()}>
        <td>
            <input type="checkbox" checked={selected} onChange={onSelect} />
        </td>
        <td>
            <Link href={`/sheet/${sheet._id}`}>{sheet.name}</Link>
        </td>
        <td>
            {sheet.schema && schemas[sheet.schema]?.header || 'unknown schema'}
        </td>
        {commonDataHeaders.map(header => 
            <td key={header}>
                {sheet.commonData ? sheet.commonData[header] : ''}
            </td>
        )}
        <td>{sheet.nRows}</td>
        <td>{sheet.permissions?.map(p => `${p.email || 'ID:' + p.userId} (${p.role})`).join(', ') || ''}</td>
        { sheet.schema === 'scuole' && profile?.isAdmin && selected &&
            <td>
                <Button disabled={creationDisabled} onClick={() => startCreation(sheet._id)}>
                    crea fogli scuole
                </Button>
            </td>
        }
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
            permissions: []
        }})
        setName('')
        setSchema('')
    }
}