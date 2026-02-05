import React, { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import SheetsSortIcon from './SheetsSortIcon'
import FilterIcon from './FilterIcon'
import Error from '@/app/components/Error'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { Sheet, useDeleteSheetsMutation, useOlimanagerCreateParticipantMutation, GetSheetsQuery, useOlimanagerBulkUpdateResultsMutation } from '../graphql/generated';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import SchoolSheetsCreation from './SheetsCreation';
import { useRouter } from 'next/navigation';
import { Lock, Archive, Unlock } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import SheetsFilter, { filterSheets } from './SheetsFilter';
import { myTimestamp, pluralize } from '../lib/util';
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery';
import Papa from 'papaparse';
import SheetFormNew from './SheetFormNew';

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

const _DELETE_SHEETS = gql`
    mutation DeleteSheets($ids: [ObjectId!]!) {
        deleteSheets(ids: $ids)
    }
`

const UPDATE_SHEET_PERMISSIONS = gql`
    mutation UpdateSheetPermissions($_id: ObjectId!, $permissions: [PermissionInput!]) {
        updateSheet(_id: $_id, permissions: $permissions)
    }
`

export default function Sheets({ sheets, profile, workbookId, refetch }: { 
    sheets: GetSheetsQuery['sheets'], 
    profile?: { isAdmin?: boolean|null, email?: string } | null,
    workbookId: ObjectId,
    refetch: () => void
}) {
    const [creationId, setCreationId] = useState<ObjectId|null>(null)
    const router = useRouter()
    const [deleteSheets, {loading: deletingSheets, error: deleteSheetsError }] = useDeleteSheetsMutation()
    const [deleteWorkbook, { loading: deletingWorkbook, error: deleteWorkbookError }] = useMutation(DELETE_WORKBOOK)
    const [validateRows, { loading: validatingRows, error: validateRowsError }] = useMutation(VALIDATE_ROWS)
    const [updateSheets, { loading: updatingSheets, error: updateSheetsError }] = useMutation(UPDATE_SHEETS)
    const [updateSheetSingle, { error: updateSheetError }] = useMutation(UPDATE_SHEET_PERMISSIONS)
    const [olimanagerCreateParticipant, { loading: olimanagerCreateParticipantLoading, error: olimanagerCreateParticipantError }] = useOlimanagerCreateParticipantMutation()
    const [olimanagerBulkUpdateResults, { loading: olimanagerBulkUpdateResultsLoading, error: olimanagerBulkUpdateResultsError }] = useOlimanagerBulkUpdateResultsMutation()
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [lastClickedId, setLastClickedId] = useState<string|null>(null)
    const [displayLimit, setDisplayLimit] = useState(20)
    const [filterMenuOpen, setFilterMenuOpen] = useState<string|null>(null)
    const { filterState, columnFilters, setColumnFilters, sort, setSort } = useSheetsFilterWithQuerystring();
    const [olimanagerEmail, setOlimanagerEmail] = useState(profile?.email || '')
    const [olimanagerPassword, setOlimanagerPassword] = useState('')

    type Sheet = GetSheetsQuery['sheets'][number]

    const allSheets: Sheet[] = sheets;
    // Applica filtro per colonne dinamiche
    let filteredSheets = filterSheets(filterState, sheets);
    Object.entries(columnFilters).forEach(([col, val]) => {
        if (!val) return
        if (col.startsWith('__')) {
            filteredSheets = filteredSheets.filter((s: Sheet) => s[col.slice(2) as keyof Sheet]?.toString().toLowerCase().includes(val.toLowerCase()))
        } else {
            filteredSheets = filteredSheets.filter((s: Sheet) => (s.commonData?.[col] ?? '').toString().toLowerCase().includes(val.toLowerCase()))
        }
    })
    let sortedSheets = filteredSheets;
    if (sort) {
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

    const columnsSet = new Set<string>()
    
    // Colonne presenti nei dati filtrati
    filteredSheets.forEach(sheet => {
        if (!sheet.commonData) return
        Object.keys(sheet.commonData).forEach(key => {
            if (key === 'info') return
            columnsSet.add(key)
        })
    })

    // Colonne con filtro attivo
    Object.keys(columnFilters).forEach(key => {
        if (columnFilters[key] && !key.startsWith('__')) columnsSet.add(key)
    })
    const columns = Array.from(columnsSet)

    // Gestione selezione
    const allSelected = selectedIds.length === filteredSheets.length && filteredSheets.length > 0;
    const toggleAll = () => {
        if (allSelected) setSelectedIds([])
        else setSelectedIds(filteredSheets.map(s => s._id.toString()))
    }
    // removed old single-toggle helper (now handled in handleCheckboxClick)

    // Escludi colonne non desiderate/duplicate nella tabella dei fogli
    // colonne già calcolate sopra (columns)

    function downloadCSV() {
        const headers = ['Nome', 'Schema', ...columns, 'righe', 'valide', 'anomalie', 'scansioni', 'scan sheets'];
        if (profile?.isAdmin) headers.push('sincronizzate');
        headers.push('aggiornato', 'stato');

        const data = filteredSheets.map(sheet => ({
            'Nome': sheet.name,
            'Schema': sheet.schema && schemas[sheet.schema]?.header || 'unknown schema',
            ...Object.fromEntries(columns.map(col => [col, sheet.commonData?.[col] ?? ''])),
            'righe': sheet.nRows,
            'valide': sheet.nValidRows,
            'anomalie': sheet.anomalies,
            'scansioni': sheet.nScanJobs,
            'scan sheets': sheet.nScanSheetJobs,
            ...(profile?.isAdmin ? {'sincronizzate': sheet.nSyncedRows ?? '?'} : {}),
            'aggiornato': sheet.updatedAt ? myTimestamp(sheet.updatedAt) : '',
            'stato': sheet.locked ? 'finalizzato' : sheet.closed ? 'chiuso' : 'aperto'
        }));

        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'sheets.csv';
        link.click();
    }

    if (creationId) return <SchoolSheetsCreation sheetId={creationId} workbookId={workbookId} done={() => {setCreationId(null);refetch()}} />

    return <>
        {allSheets.length === 0 ? (
            <div className="bg-alert">Nessun foglio disponibile</div>
        ) : (
            <>
            <div className="flex justify-between mb-2 items-start">
                <SheetsFilter filterState={filterState} sheets={sheets} filteredSheets={filteredSheets}/>
                <Button onClick={downloadCSV}>download CSV</Button>
            </div>
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
                        <Th field="##nValidRows" header="valide" />
                        <Th field="##anomalies" header="anomalie" />
                        <Th field="##nScanJobs" header="scansioni" />
                        <Th field="##nScanSheetJobs" header="scan sheets" />
                        { profile?.isAdmin && <Th field="##nSyncedRows" header="sincronizzate" /> }
                        <Th field="__updatedAt" header="aggiornato" />
                        <th>stato</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedSheets.map((sheet) => (
                        sheet &&
                        <SheetRow
                            key={sheet._id?.toString()}
                            sheet={sheet} 
                            profile={profile}
                            commonDataHeaders={columns}
                            creationDisabled={creationId !== null} 
                            startCreation={sheetId => setCreationId(sheetId)} 
                            selected={selectedIds.includes(sheet._id.toString())}
                            onCheckboxClick={(e) => handleCheckboxClick(sheet._id, e)}
                        />
                    ))}
                </tbody>
            </table>
            </>
        )}
        {hasMore && (
            <div className="my-2">
                {displayLimit} / {filteredSheets.length} fogli mostrati
                <Button className="ml-2" onClick={() => setDisplayLimit(limit => limit*10)}>
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
        <Error error={updateSheetError} />
        <Error error={olimanagerCreateParticipantError} />
        <Error error={olimanagerBulkUpdateResultsError} />
        { profile?.isAdmin && 
            <div className="flex items-center gap-3 my-2">
                <Button variant="danger" disabled={selectedIds.length === 0 || deletingSheets} onClick={() => deleteSelectedSheets()}>
                    ⚙ Elimina {pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}
                </Button>
                <Button disabled={selectedIds.length === 0 || validatingRows} onClick={() => validateSelectedSheets()}>
                    ⚙ Rivalida {pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}
                </Button>
                <Button disabled={selectedIds.length === 0 || updatingSheets} onClick={() => lockSelectedSheets()}>
                    ⚙ Finalizza {pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}
                </Button>
                <Button disabled={selectedIds.length === 0 || updatingSheets} onClick={() => unlockSelectedSheets()}>
                    ⚙ Sblocca {pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}
                </Button>
                <Button disabled={selectedIds.length === 0 || olimanagerCreateParticipantLoading} onClick={() => handleOlimanagerCreateParticipantsForSheets()}>
                    ⚙ Crea/abbina partecipanti (Olimanager)
                </Button>
                <Button disabled={selectedIds.length === 0 || olimanagerBulkUpdateResultsLoading} onClick={() => handleOlimanagerBulkUpdateResults()}>
                    ⚙ Invia risultati (Olimanager)
                </Button>
                <Button variant="danger" disabled={filteredSheets.length > 0 || deletingWorkbook} onClick={onDelete}>
                    ⚙ Elimina raccolta
                </Button>
            </div>
        }
        <Error error={updateSheetsError} />
        { 
            selectedIds.length > 0 && profile?.isAdmin &&
            <BulkCommonDataSetter sheets={filteredSheets.filter(sheet => selectedIds.includes(sheet._id.toString()))} onApply={applyBulkCommonData} />
        }
        { 
            selectedIds.length > 0 && profile?.isAdmin &&
            <BulkPermissionSetter 
                sheets={filteredSheets.filter(sheet => selectedIds.includes(sheet._id.toString()))}
                onApply={applyBulkPermission}
            />
        }
        {workbookId && profile?.isAdmin && <SheetFormNew workbookId={workbookId} />}
    </>

    function Th({field,header}:{field:string,header:string}) {
        const isFiltered = !!columnFilters[field]
        return <th key={field} style={{ position: 'relative' }}>
            <span className="flex items-center justify-between gap-2">
                <span>{header.replace('_', ' ')}</span>
                <span className="flex items-center gap-1">
                    <span style={{ cursor: 'pointer' }} onClick={() => {
                        setSort(s => {
                            if (!s || s.field !== field) return { field: field, direction: 1 };
                            if (s.direction === 1) return { field: field, direction: -1 };
                            return null;
                        });
                    }}>
                        <SheetsSortIcon direction={sort?.field === field ? sort.direction : undefined} />
                    </span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setFilterMenuOpen(filterMenuOpen === field ? null : field)}>
                        <FilterIcon active={isFiltered} />
                    </span>
                </span>
            </span>
            {filterMenuOpen === field && (
                <div> 
                {/*style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #ccc', padding: 8, zIndex: 10, minWidth: 120 }}>*/}
                    <input
                        type="text"
                        value={columnFilters[field] || ''}
                        onChange={e => setColumnFilters(f => ({ ...f, [field]: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Escape') {
                                setColumnFilters(f => ({ ...f, [field]: '' }))
                                setFilterMenuOpen(null)
                            }
                        }}
                        placeholder={`Filtra ${header}`}
                        className="border rounded px-2 py-1 w-full"
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                        <button className="text-xs px-2 py-1 border rounded" onClick={() => setColumnFilters(f => ({ ...f, [field]: '' }))}>Reset</button>
                        <button className="text-xs px-2 py-1 border rounded" onClick={() => setFilterMenuOpen(null)}>Chiudi</button>
                    </div>
                </div>
            )}
        </th>
    }

    async function deleteSelectedSheets() {
      if (!confirm(`Sei sicuro di voler eliminare ${pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}?`)) return
      await deleteSheets({ variables: { ids: selectedIds.map(id => new ObjectId(id)) } })
      setSelectedIds([])
      refetch()
    }

    async function validateSelectedSheets() {
      if (!confirm(`Sei sicuro di voler validare ${pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}?`)) return
      console.log('validateSelectedSheets: validating', selectedIds.length, 'sheets')
      for (const id of selectedIds) {
        console.log('validateSelectedSheets: validating sheet', id)
        const result = await validateRows({ variables: { sheetId: new ObjectId(id) } })
        console.log('validateSelectedSheets: result for sheet', id, ':', result)
      }
      console.log('validateSelectedSheets: refetching data')
      refetch()
    }

    async function lockSelectedSheets() {
        if (!confirm(`Sei sicuro di voler finalizzare ${pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}?`)) return
        const updates = selectedIds.map(id => ({
            _id: new ObjectId(id),
            locked: true
        }))
        await updateSheets({ variables: { sheets: updates } })
        refetch()
    }

    async function unlockSelectedSheets() {
        if (!confirm(`Sei sicuro di voler sbloccare (definalizzare) ${pluralize(selectedIds.length, 'foglio selezionato', 'fogli selezionati')}?`)) return
        const updates = selectedIds.map(id => ({
            _id: new ObjectId(id),
            locked: false
        }))
        await updateSheets({ variables: { sheets: updates } })
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

    async function applyBulkPermission(email: string, role: 'admin' | 'editor' | 'view') {
        if (!profile?.isAdmin) return
        const emailTrimmed = (email || '').trim()
        if (!emailTrimmed || !emailTrimmed.includes('@')) return
        const selectedSheets = filteredSheets.filter(sheet => selectedIds.includes(sheet._id.toString()))
        // Aggiorna i permessi su ciascun foglio: sostituisce eventuale entry per la stessa email
        await Promise.all(selectedSheets.map(async (sheet) => {
            const existing = (sheet.permissions || [])
            type PermInput = { email: string; role: 'admin'|'editor'|'view' }
            // Rimuovi l'eventuale permesso per la stessa email e pulisci i campi per l'input GraphQL (niente __typename)
            const kept: PermInput[] = existing
                .filter(p => p.email !== emailTrimmed)
                .map(p => ({ email: p.email, role: p.role as 'admin'|'editor'|'view' }))
            const nextPermissions: PermInput[] = [
                ...kept,
                { email: emailTrimmed, role }
            ]
            // Assicurati che gli oggetti rispettino PermissionInput
            const cleanPermissions = nextPermissions.map(p => ({
                email: p.email,
                role: p.role
            }))
            await updateSheetSingle({ variables: { _id: sheet._id, permissions: cleanPermissions } })
        }))
        refetch()
    }

    function askOlimanagerCredentials(): {username: string, password: string} {
        const username = prompt('Username olimanager (email)', olimanagerEmail) ?? ''
        const password = prompt('Password', olimanagerPassword) ?? ''
        setOlimanagerEmail(username)
        setOlimanagerPassword(password)
        return {username, password}
    }

    async function handleOlimanagerCreateParticipantsForSheets() {
        if (!confirm(`Inviare tutti i partecipanti ${pluralize(selectedIds.length, 'del foglio selezionato', 'dei % fogli selezionati')} a Olimanager per creazione/abbinamento?`)) {
            return
        }
        const {username, password} = askOlimanagerCredentials()
        const res = await olimanagerCreateParticipant({ variables: { sheetIds: selectedIds.map(id => new ObjectId(id)), username, password } }) as {data?: {olimanagerCreateParticipant?: {success: boolean, error?: string, participantId?: string, skipped?: boolean, converted?: boolean}[]}}
        const arr = res.data?.olimanagerCreateParticipant || []

        const totalSuccess = arr.filter(r => r.success).length
        const skipped = arr.filter(r => r.skipped).length
        const converted = arr.filter(r => r.converted).length
        const ok = totalSuccess - skipped - converted
        const ko = arr.length - totalSuccess

        const errorMessages = arr.filter(r => !r.success).map(r => r.error).filter(Boolean)
        
        let msg = `Esito Olimanager: ${ok} creati/abbinati`
        if (skipped > 0) msg += `, ${skipped} saltati`
        if (converted > 0) msg += `, ${converted} convertiti`
        msg += `, ${ko} errori`
        
        if (errorMessages.length > 0) {
            msg += '\n\nErrori:\n' + errorMessages.join('\n')
        }

        alert(msg)
        refetch()
    }

    async function handleOlimanagerBulkUpdateResults() {
        if (!confirm(`Inviare i risultati di tutti i partecipanti ${pluralize(selectedIds.length, 'del foglio selezionato', 'dei % fogli selezionati')} a Olimanager?`)) {
            return
        }
        const {username, password} = askOlimanagerCredentials()
        const res = await olimanagerBulkUpdateResults({ variables: { sheetIds: selectedIds.map(id => new ObjectId(id)), username, password } }) as {data?: {olimanagerBulkUpdateResults?: {success: boolean, error?: string}[]}}
        const success = res.data?.olimanagerBulkUpdateResults
        if (success) alert("Risultati inviati con successo a Olimanager")
        else alert("Errore durante l'invio dei risultati a Olimanager")
        refetch()
    }

    function handleCheckboxClick(id: ObjectId, e: React.ChangeEvent<HTMLInputElement>) {
        // nativeEvent può essere MouseEvent o InputEvent, ma shiftKey è solo su MouseEvent
        const native = e.nativeEvent
        const shift = 'shiftKey' in native && typeof native.shiftKey === 'boolean' ? native.shiftKey : false
        const checked = e.currentTarget.checked
        const idStr = id.toString()
        setSelectedIds(prev => {
            if (shift && lastClickedId) {
                const anchorIndex = displayedSheets.findIndex(s => s._id.toString() === lastClickedId)
                const currentIndex = displayedSheets.findIndex(s => s._id.toString() === idStr)
                if (anchorIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(anchorIndex, currentIndex)
                    const end = Math.max(anchorIndex, currentIndex)
                    const idsInRange = displayedSheets.slice(start, end + 1).map(s => s._id.toString())
                    if (checked) {
                        const set = new Set(prev)
                        idsInRange.forEach(i => set.add(i))
                        return Array.from(set)
                    } else {
                        return prev.filter(i => !idsInRange.includes(i))
                    }
                }
                // se l'ancora non è visibile/valida, ricadi su toggle singolo
            }
            if (checked) {
                if (prev.includes(idStr)) return prev
                return [...prev, idStr]
            } else {
                return prev.filter(i => i !== idStr)
            }
        })
        setLastClickedId(idStr)
       }
    }

function SheetRow({sheet, profile, creationDisabled, startCreation, commonDataHeaders, selected, onCheckboxClick}: {
    sheet: Partial<Sheet> & {_id: ObjectId}, 
    profile?: {isAdmin?: boolean|null}|null,
    creationDisabled: boolean, 
    startCreation: (id: ObjectId) => void,
    commonDataHeaders: string[],
    selected: boolean,
    onCheckboxClick: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
    return <tr key={sheet._id?.toString()}>
        <td>
            <input type="checkbox" checked={selected} onChange={onCheckboxClick} />
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
        <td>{sheet.anomalies}</td>
        <td>{sheet.nScanJobs}</td>
        <td>{sheet.nScanSheetJobs}</td>
        { profile?.isAdmin && <td>{sheet.nSyncedRows ?? '?'}</td> }
        <td>{sheet.updatedAt ? myTimestamp(sheet.updatedAt) : ''}</td>
        <td className=""><span className="flex">
            {sheet.locked 
                ? <><Lock size={16} className="text-red-600" />&nbsp;finalizzato</> 
                : sheet.closed 
                    ? <><Archive size={16} className="text-orange-500" />&nbsp;chiuso</> 
                    : <><Unlock size={16} className="text-green-600" />&nbsp;aperto</>}
            </span>
        </td>
        { sheet.schema === 'scuole' && profile?.isAdmin && selected &&
            <td>
                <Button disabled={creationDisabled} onClick={() => startCreation(sheet._id)}>
                    ⚙ crea fogli
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
            alert(`Campo "${field}" impostato su ${sheets.length} fogli`)
        } finally {
            setLoading(false)
        }
    }

    return <div className="p-4 border rounded bg-gray-50">
        <h2 className="font-bold mb-2">⚙ Modifica dati comuni</h2>
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
            ⚙ Applica
        </Button> su {sheets.length} fogli
    </div>
}

function BulkPermissionSetter({sheets, onApply}:{
    sheets: Partial<Sheet>[],
    onApply: (email: string, role: 'admin'|'editor'|'view') => Promise<void>
}) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<'admin'|'editor'|'view'>('editor')
    const [loading, setLoading] = useState(false)

    const ROLE_LABELS: Record<'admin'|'editor'|'view', string> = {
        admin: 'responsabile',
        editor: 'aiutante',
        view: 'supervisore'
    }

    const handleApply = async () => {
        const e = email.trim()
        if (!e || !e.includes('@')) return
        setLoading(true)
        try {
            await onApply(e, role)
            alert(`Permesso "${ROLE_LABELS[role]}" assegnato a ${e} su ${sheets.length} fogli`)
            setEmail('')
            setRole('editor')
        } finally {
            setLoading(false)
        }
    }

    return <div className="p-4 border rounded bg-gray-50 mt-3">
        <h2 className="font-bold mb-2">⚙ Concedi permesso in blocco</h2>
        <table className="commondata">
            <tbody>
            <tr>
                <th>
                    <input 
                        className="p-1" 
                        type="email"
                        placeholder="email utente"
                        value={email} 
                        onChange={e => setEmail(e.target.value)}
                    />
                </th>
                <td>
                    <select className="p-1" value={role} onChange={e => setRole(e.target.value as 'admin'|'editor'|'view')}>
                        {(['admin','editor','view'] as const).map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                    </select>
                </td>
            </tr>
            </tbody>
        </table>
        <Button disabled={loading || !email.trim()} onClick={handleApply}>
            ⚙ Concedi
        </Button> su {sheets.length} fogli
    </div>
}