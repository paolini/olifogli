import { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import SheetsSortIcon from './SheetsSortIcon'
import Error from '@/app/components/Error'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { Sheet, useDeleteSheetsMutation, GetSheetsQuery } from '../graphql/generated';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import SchoolSheetsCreation from './SchoolSheetsCreation';
import { useRouter } from 'next/navigation';
import { Lock, Archive, Unlock } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import SheetsFilter, { filterSheets, useSheetsFilterState } from './SheetsFilter';
import { Be_Vietnam_Pro } from 'next/font/google';

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

const VALIDATE_ROWS = gql`
    mutation ValidateRows($sheetId: ObjectId!) {
        validateRows(sheetId: $sheetId)
    }
`

const UPDATE_SHEETS = gql`
    mutation UpdateSheets($sheets: [UpdateSheetInput!]!) {
        updateSheets(sheets: $sheets)
    }
`

export default function Sheets({ sheets, profile, workbookId, refetch }: { 
    sheets: GetSheetsQuery['sheets'], 
    profile?: { isAdmin?: boolean|null } | null,
    workbookId: ObjectId,
    refetch: () => void
}) {
    const [creationId, setCreationId] = useState<ObjectId|null>(null)
    // Stato ordinamento colonne
    const [sort, setSort] = useState<{ field: string, direction: number } | null>(null)
    const router = useRouter()
    const [deleteSheets, {loading: deletingSheets, error: deleteSheetsError }] = useDeleteSheetsMutation()
    const [deleteWorkbook, { loading: deletingWorkbook, error: deleteWorkbookError }] = useMutation(DELETE_WORKBOOK)
    const [validateRows, { loading: validatingRows, error: validateRowsError }] = useMutation(VALIDATE_ROWS)
    const [updateSheets, { loading: updatingSheets, error: updateSheetsError }] = useMutation(UPDATE_SHEETS)
    // Stato per la selezione delle righe
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    // Stato per la paginazione
    const [displayLimit, setDisplayLimit] = useState(20)
    const filterState = useSheetsFilterState()

    const allSheets: GetSheetsQuery['sheets'] = sheets;
    const filteredSheets = filterSheets(filterState, allSheets);
    let sortedSheets = filteredSheets;
    if (sort) {
        type Sheet = GetSheetsQuery['sheets'][number]

        // sort.field può avere tre varianti:
        // "__field": è un attributo di sheet
        // "##field": è un attributo numerico di sheet
        // "field": è un valore di sheet.commonData

        const [prefix, field] = sort.field.match(/^(__)|(##)/) 
            ? [sort.field.slice(0,2), sort.field.slice(2)]
            : ['', sort.field]
        const get_field = prefix === ''
            ? (sheet: Sheet) => (sheet?.commonData?.[field] ?? '')
            : (sheet: Sheet) => ((sheet as Record<string, unknown>)[field] ?? '');
        const compare_function = prefix === '##'
            ? ((av:unknown, bv:unknown) => ((bv as number) - (av as number)) * sort.direction)
            : ((av:unknown, bv:unknown) => (av as string).localeCompare((bv as string), 'it', { sensitivity: 'base' }) * sort.direction);
        sortedSheets = [...filteredSheets].sort((a, b) => {
            const av = get_field(a);
            const bv = get_field(b);
            return compare_function(av, bv);
        });
    }
    const displayedSheets = sortedSheets.slice(0, displayLimit);
    const hasMore = filteredSheets.length > displayLimit;

    const emptySheetIds = filteredSheets.filter((s:Partial<Sheet>) => s.nRows === 0).map(s => s._id)

    const columnsSet = new Set<string>()
    filteredSheets.forEach(sheet => {
        if (!sheet.commonData) return
        Object.keys(sheet.commonData).forEach(key => {
            if (key === 'info') return
            columnsSet.add(key)
        })
    })
    const columns = Array.from(columnsSet)

    // Gestione selezione
    const allSelected = selectedIds.length === filteredSheets.length && filteredSheets.length > 0;
    const toggleAll = () => {
        if (allSelected) setSelectedIds([])
        else setSelectedIds(filteredSheets.map(s => s._id.toString()))
    }
    const toggleOne = (id: ObjectId) => {
        const idStr = id.toString();
        setSelectedIds(ids => ids.includes(idStr) ? ids.filter(i => i !== idStr) : [...ids, idStr])
    }

    // Escludi colonne non desiderate/duplicate nella tabella dei fogli
    // colonne già calcolate sopra (columns)

    return <>
        {allSheets.length === 0 ? (
            <div className="bg-alert">Nessun foglio disponibile</div>
        ) : (
            <>
            <SheetsFilter filterState={filterState} sheets={allSheets} filteredSheets={filteredSheets}/>
            <table>
                <thead>
                    <tr>
                        <th>
                            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                        </th>
                        <Th field="__name" header="Nome" />
                        <Th field="__schema" header="Schema" />
                        {columns.map(header => 
                            <Th key={header} field={header} header={header} />
                        )}
                        <Th field="##nRows" header="righe" />
                        <Th field="##validRows" header="valide" />
                        <th>stato</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedSheets.map(sheet => (
                        sheet && (!creationId || sheet._id.toString() === creationId.toString()) &&
                        <SheetRow 
                            key={sheet._id?.toString()} 
                            sheet={sheet} 
                            profile={profile}
                            commonDataHeaders={columns}
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
                {displayLimit} / {filteredSheets.length} fogli mostrati
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
        <Error error={validateRowsError} />
        { profile?.isAdmin && 
            <div className="flex items-center gap-3 my-2">
                <Button variant="danger" disabled={emptySheetIds.length === 0 || deletingSheets} onClick={deleteEmptySheets}>
                    Elimina {emptySheetIds.length} {emptySheetIds.length === 1 ? 'foglio vuoto' : 'fogli vuoti'}
                </Button> 
                <Button variant="danger" disabled={selectedIds.length === 0 || deletingSheets} onClick={deleteSelectedSheets}>
                    Elimina {selectedIds.length} {selectedIds.length === 1 ? 'foglio selezionato' : 'fogli selezionati'}
                </Button>
                <Button disabled={selectedIds.length === 0 || validatingRows} onClick={validateSelectedSheets}>
                    Rivalida {selectedIds.length} {selectedIds.length === 1 ? 'foglio selezionato' : 'fogli selezionati'}
                </Button>
                <Button variant="danger" disabled={filteredSheets.length > 0 || deletingWorkbook} onClick={onDelete}>
                    Elimina raccolta
                </Button>
            </div>
        }
        <Error error={updateSheetsError} />
        { 
            selectedIds.length > 0 && profile?.isAdmin &&
            <BulkCommonDataSetter sheets={filteredSheets.filter(sheet => selectedIds.includes(sheet._id.toString()))} onApply={applyBulkCommonData} />
        }
        {creationId && <SchoolSheetsCreation sheetId={creationId} workbookId={workbookId} done={() => {setCreationId(null);refetch()}} />}
    </>

    function Th({field,header}:{field:string,header:string}) {
        return <th key={field} style={{ cursor: 'pointer' }} onClick={() => {
            setSort(s => {
                if (!s || s.field !== field) return { field: field, direction: 1 };
                if (s.direction === 1) return { field: field, direction: -1 };
                return null;
            });
        }}>
            <span className="flex items-center gap-1">
                {header.replace('_', ' ')}
                <SheetsSortIcon direction={sort?.field === header ? sort.direction : undefined} />
            </span>
        </th>

    }

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

    async function validateSelectedSheets() {
      if (!confirm(`Sei sicuro di voler validare ${selectedIds.length} fogli selezionati?`)) return
      console.log('validateSelectedSheets: validating', selectedIds.length, 'sheets')
      for (const id of selectedIds) {
        console.log('validateSelectedSheets: validating sheet', id)
        const result = await validateRows({ variables: { sheetId: new ObjectId(id) } })
        console.log('validateSelectedSheets: result for sheet', id, ':', result)
      }
      console.log('validateSelectedSheets: refetching data')
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

    async function applyBulkCommonData(field: string, value: string) {
        if (!profile?.isAdmin) return
        const selectedSheets = filteredSheets.filter(sheet => selectedIds.includes(sheet._id.toString()))
        const updates = selectedSheets.map(sheet => ({
            _id: sheet._id,
            commonData: { ...sheet.commonData, [field]: value }
        }))
        await updateSheets({ variables: { sheets: updates } })
        refetch()
    }

}

function SheetRow({sheet, profile, creationDisabled, startCreation, commonDataHeaders, selected, onSelect}: {
    sheet: Partial<Sheet> & {_id: ObjectId}, 
    profile?: {isAdmin?: boolean|null}|null,
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
                {sheet.commonData[header] ?? ''}
            </td>
        )}
        <td>{sheet.nRows}</td>
        <td>{sheet.nValidRows}</td>
        <td className=""><span className="flex">
            {sheet.locked 
                ? <><Lock size={16} className="text-red-600" />&nbsp;chiuso</> 
                : sheet.closed 
                    ? <><Archive size={16} className="text-orange-500" />&nbsp;bloccato</> 
                    : <><Unlock size={16} className="text-green-600" />&nbsp;aperto</>}
            </span>
        </td>
        { sheet.schema === 'scuole' && profile?.isAdmin && selected &&
            <td>
                <Button disabled={creationDisabled} onClick={() => startCreation(sheet._id)}>
                    crea fogli scuole
                </Button>
            </td>
        }
    </tr>
}

function BulkCommonDataSetter({sheets, onApply}:{
    sheets: Partial<Sheet>[],
    onApply: (field: string, value: string) => Promise<void>
}) {
    const [field, setField] = useState('')
    const [value, setValue] = useState('')
    const [loading, setLoading] = useState(false)
    const [useTextarea, setUseTextarea] = useState(false)

    const handleApply = async () => {
        if (!field.trim()) return
        setLoading(true)
        try {
            await onApply(field, value)
        } finally {
            setLoading(false)
        }
    }

    return <div className="p-4 border rounded bg-gray-50">
        <h2 className="font-bold mb-2">Modifica dati comuni</h2>
        <div className="mb-2">
            <label className="flex items-center gap-2">
                <input type="checkbox" checked={useTextarea} onChange={e => setUseTextarea(e.target.checked)} />
                Usa editor markdown per il valore
            </label>
        </div>
        <table className="commondata">
            <tbody>
            <tr>
                <th><input className="p-1" placeholder="campo" value={field} onChange={e => setField(e.target.value)}/></th>
                <td>
                    {useTextarea ? (
                        <MDEditor
                            value={value}
                            onChange={(val) => setValue(val || '')}
                            preview="edit"
                            hideToolbar={false}
                            visibleDragbar={false}
                            height={150}
                        />
                    ) : (
                        <input 
                            className="p-1" 
                            placeholder="valore" 
                            value={value} 
                            onChange={e => setValue(e.target.value)}
                        />
                    )}
                </td>
            </tr>
            </tbody>
        </table>
        <Button disabled={loading || !field.trim()} onClick={handleApply}>
            {loading ? 'Applicazione...' : 'Applica'}
        </Button> su {sheets.length} fogli
    </div>
}