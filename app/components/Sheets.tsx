import React, { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import SheetsSortIcon from './SheetsSortIcon'
import FilterIcon from './FilterIcon'
import Error from '@/app/components/Error'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { Sheet, useDeleteSheetsMutation, useRequestOlimanagerCheckMutation, useRequestOlimanagerMatchMutation, GetSheetsQuery, useRequestOlimanagerResultsMutation, useOlimanagerUpdateExtraFieldsMutation } from '../graphql/generated';
import { useMutation } from '@apollo/client';
import Link from 'next/link';
import SchoolSheetsCreation from './SheetsCreation';
import { useRouter } from 'next/navigation';
import { Lock, Archive, Unlock, X } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import SheetsFilter, { filterSheets } from './SheetsFilter';
import { myTimestamp, pluralize } from '../lib/util';
import { useSheetsFilterWithQuerystring } from './SheetsFilterQuery';
import { unparseCsv } from '../lib/csv'

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

const UPDATE_SHEET_PERMISSIONS = gql`
    mutation UpdateSheetPermissions($_id: ObjectId!, $permissions: [PermissionInput!]) {
        updateSheet(_id: $_id, permissions: $permissions)
    }
`

const CRYPT_SHEETS = gql`
    mutation CryptSheets($sheetIds: [ObjectId!]!, $password: String!) {
        cryptSheets(sheetIds: $sheetIds, password: $password)
    }
`

const DECRYPT_SHEETS = gql`
    mutation DecryptSheets($sheetIds: [ObjectId!]!, $password: String!) {
        decryptSheets(sheetIds: $sheetIds, password: $password)
    }
`

export default function Sheets({ sheets, profile, workbookId, refetch, adminActions }: { 
    sheets: GetSheetsQuery['sheets'], 
    profile?: { isAdmin?: boolean|null, email?: string } | null,
    workbookId: ObjectId,
    refetch: () => void,
    adminActions?: React.ReactNode
}) {
    const [creationId, setCreationId] = useState<ObjectId|null>(null)
    const router = useRouter()
    const [deleteSheets, {loading: deletingSheets, error: deleteSheetsError }] = useDeleteSheetsMutation()
    const [deleteWorkbook, { loading: deletingWorkbook, error: deleteWorkbookError }] = useMutation(DELETE_WORKBOOK)
    const [validateRows, { loading: validatingRows, error: validateRowsError }] = useMutation(VALIDATE_ROWS)
    const [updateSheets, { loading: updatingSheets, error: updateSheetsError }] = useMutation(UPDATE_SHEETS)
    const [updateSheetSingle, { error: updateSheetError }] = useMutation(UPDATE_SHEET_PERMISSIONS)
    const [requestOlimanagerMatch, { loading: matchingOlimanager, error: matchOlimanagerError }] = useRequestOlimanagerMatchMutation({ refetchQueries: ['OlimanagerJobs'] })
    const [requestOlimanagerCheck, { loading: checkingOlimanager, error: checkOlimanagerError }] = useRequestOlimanagerCheckMutation({
        refetchQueries: ['OlimanagerJobs'],
    })
    const [requestOlimanagerResults, { loading: resultsLoading, error: resultsError }] = useRequestOlimanagerResultsMutation({ refetchQueries: ['OlimanagerJobs'] })
    const [olimanagerUpdateExtraFields, { loading: olimanagerUpdateExtraFieldsLoading, error: olimanagerUpdateExtraFieldsError}] = useOlimanagerUpdateExtraFieldsMutation()
    const [cryptSheetsMutation, { loading: cryptSheetsLoading, error: cryptSheetsError }] = useMutation(CRYPT_SHEETS, { refetchQueries: ['OlimanagerJobs'] })
    const [decryptSheetsMutation, { loading: decryptSheetsLoading, error: decryptSheetsError }] = useMutation(DECRYPT_SHEETS, { refetchQueries: ['OlimanagerJobs'] })
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [lastClickedId, setLastClickedId] = useState<string|null>(null)
    const [displayLimit, setDisplayLimit] = useState(20)
    const { filterState, columnFilters, setColumnFilters, sort, setSort } = useSheetsFilterWithQuerystring();
    // Filtro aperto con un clic e ancora vuoto; i filtri non vuoti restano sempre aperti.
    const [filterMenuOpen, setFilterMenuOpen] = useState<string|null>(null)

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

    // Gestione selezione. La selezione sopravvive ai cambi di filtro: si può
    // selezionare con un filtro, cambiarlo e aggiungere altri fogli. Le azioni
    // agiscono su tutti i fogli selezionati, anche se non visibili; le conferme
    // segnalano quanti sono.
    const selectedIdSet = new Set(selectedIds)
    const selectedSheets = allSheets.filter(sheet => selectedIdSet.has(sheet._id.toString()))
    const selectedSheetIds = selectedSheets.map(sheet => sheet._id.toString())
    const displayedIdSet = new Set(displayedSheets.map(sheet => sheet._id.toString()))
    const hiddenSelectedCount = selectedSheetIds.filter(id => !displayedIdSet.has(id)).length
    const allSelected = filteredSheets.length > 0 && filteredSheets.every(s => selectedIdSet.has(s._id.toString()));
    const toggleAll = () => {
        const filteredIds = filteredSheets.map(s => s._id.toString())
        if (allSelected) setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)))
        else setSelectedIds(prev => Array.from(new Set([...prev, ...filteredIds])))
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

        const csv = unparseCsv(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'sheets.csv';
        link.click();
    }

    const selectedSheetsActions: { key: string, label: string, disabled: boolean, run: () => void }[] = [
        { key: 'delete', label: 'Elimina', disabled: deletingSheets, run: deleteSelectedSheets },
        { key: 'validate', label: 'Rivalida', disabled: validatingRows, run: validateSelectedSheets },
        { key: 'lock', label: 'Finalizza', disabled: updatingSheets, run: lockSelectedSheets },
        { key: 'unlock', label: 'Sblocca', disabled: updatingSheets, run: unlockSelectedSheets },
        { key: 'olimanagerCheck', label: 'Verifica collegamenti olimanager', disabled: checkingOlimanager, run: async () => {
            try {
                await requestOlimanagerCheck({ variables: { sheetIds: selectedSheetIds.map(id => new ObjectId(id)) } })
            } catch { /* Apollo exposes the error above. */ }
        } },
        { key: 'olimanagerMatch', label: 'Crea/abbina partecipanti su olimanager', disabled: matchingOlimanager, run: handleOlimanagerCreateParticipantsForSheets },
        { key: 'olimanagerResults', label: 'Invia risultati su olimanager', disabled: resultsLoading, run: handleOlimanagerBulkUpdateResults },
        { key: 'crypt', label: 'Cripta', disabled: cryptSheetsLoading, run: cryptSelectedSheets },
        { key: 'decrypt', label: 'Decripta', disabled: decryptSheetsLoading, run: decryptSelectedSheets },
    ]

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
                        {renderTh("__name", "Nome")}
                        {renderTh("__schema", "Schema")}
                        {columns.map(header => 
                            renderTh(header, header)
                        )}
                        {renderTh("##nRows", "righe")}
                        {renderTh("##nValidRows", "valide")}
                        {renderTh("##anomalies", "anomalie")}
                        {renderTh("##nScanJobs", "scansioni")}
                        {renderTh("##nScanSheetJobs", "scan sheets")}
                        { profile?.isAdmin && renderTh("##nSyncedRows", "sincronizzate") }
                        {renderTh("__updatedAt", "aggiornato")}
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
                            selected={selectedIdSet.has(sheet._id.toString())}
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
                <Button variant="secondary" className="ml-2" onClick={() => setDisplayLimit(limit => limit*10)}>
                    Mostra più
                </Button>
                <Button variant="secondary" className="ml-2" onClick={() => setDisplayLimit(20)}>
                    Mostra meno
                </Button>
            </div>
        )}
        <Error error={deleteWorkbookError} />
        <Error error={deleteSheetsError} />
        <Error error={validateRowsError} />
        <Error error={updateSheetError} />
        <Error error={checkOlimanagerError} />
        <Error error={matchOlimanagerError} />

        <Error error={resultsError} />
        { profile?.isAdmin &&
            <fieldset className="my-2 p-2 border bg-gray-100">
                <legend className="px-1 font-bold">⚙ admin</legend>
                <div className="flex items-center gap-3">
                    <select
                        className="p-1 border"
                        value=""
                        disabled={selectedSheetIds.length === 0}
                        onChange={e => {
                            const action = selectedSheetsActions.find(a => a.key === e.target.value)
                            if (action && !action.disabled) action.run()
                        }}
                    >
                        <option value="" disabled>
                            {pluralize(selectedSheetIds.length, 'agisci su un foglio selezionato', 'agisci su % fogli selezionati')}
                        </option>
                        {selectedSheetsActions.map(action =>
                            <option key={action.key} value={action.key} disabled={action.disabled}>
                                {action.label}
                            </option>
                        )}
                    </select>
                    <Button variant="danger" disabled={filteredSheets.length > 0 || deletingWorkbook} onClick={onDelete}>
                        ⚙ Elimina raccolta
                    </Button>
                </div>
                <Error error={updateSheetsError} />
                { selectedSheetIds.length > 0 && <>
                    <BulkCommonDataSetter sheets={selectedSheets} hiddenCount={hiddenSelectedCount} onApply={applyBulkCommonData} />
                    <BulkPermissionSetter sheets={selectedSheets} hiddenCount={hiddenSelectedCount} onApply={applyBulkPermission} />
                </>}
                { adminActions && <div className="mt-2 flex flex-wrap items-start gap-2">{adminActions}</div> }
            </fieldset>
        }
    </>

    function hiddenSelectedNote() {
        if (hiddenSelectedCount === 0) return ''
        return '\n\nAttenzione: ' + pluralize(hiddenSelectedCount,
            'un foglio selezionato non è visibile',
            '% fogli selezionati non sono visibili') +
            ' (nascosti dai filtri o oltre quelli mostrati).'
    }

    function clearFilter(field: string) {
        setColumnFilters(f => ({ ...f, [field]: '' }))
        if (filterMenuOpen === field) setFilterMenuOpen(null)
    }

    // Chiamata come funzione e non come componente: un componente definito qui
    // dentro verrebbe rimontato a ogni render, ricreando il campo del filtro.
    function renderTh(field: string, header: string) {
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
            {(isFiltered || filterMenuOpen === field) && (
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={columnFilters[field] || ''}
                        onChange={e => setColumnFilters(f => ({ ...f, [field]: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Escape') clearFilter(field)
                        }}
                        placeholder={`Filtra ${header}`}
                        className="border rounded px-2 py-1 w-full min-w-0"
                        autoFocus={filterMenuOpen === field}
                    />
                    <button className="p-1 border rounded" title="Togli il filtro" onClick={() => clearFilter(field)}>
                        <X size={14} />
                    </button>
                </div>
            )}
        </th>
    }

    async function deleteSelectedSheets() {
      if (!confirm(`Sei sicuro di voler eliminare ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return
      await deleteSheets({ variables: { ids: selectedSheetIds.map(id => new ObjectId(id)) } })
      setSelectedIds([])
      refetch()
    }

    async function validateSelectedSheets() {
      if (!confirm(`Sei sicuro di voler validare ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return

      for (const id of selectedSheetIds) {
        const result = await validateRows({ variables: { sheetId: new ObjectId(id) } })

      }

      refetch()
    }

    async function lockSelectedSheets() {
        if (!confirm(`Sei sicuro di voler finalizzare ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return
        const updates = selectedSheetIds.map(id => ({
            _id: new ObjectId(id),
            locked: true
        }))
        await updateSheets({ variables: { sheets: updates } })
        refetch()
    }

    async function unlockSelectedSheets() {
        if (!confirm(`Sei sicuro di voler sbloccare (definalizzare) ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return
        const updates = selectedSheetIds.map(id => ({
            _id: new ObjectId(id),
            locked: false
        }))
        await updateSheets({ variables: { sheets: updates } })
        refetch()
    }

    async function cryptSelectedSheets() {
        if (!profile?.isAdmin) return
        if (!confirm(`Applicare la crittografia a ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return
        const password = prompt('Password per crittografia') || ''
        const confirmPassword = prompt('Conferma password') || ''
        if (password !== confirmPassword) {
            alert('Le password non corrispondono')
            return
        }
        if (!password) return
        try {
            await cryptSheetsMutation({ variables: { sheetIds: selectedSheetIds.map(id => new ObjectId(id)), password } })
            alert('Crittografia accodata al worker. Puoi seguirne lo stato nelle operazioni in background.')
        } catch (e) {
            alert(e instanceof globalThis.Error ? e.message : 'Errore durante la richiesta di crittografia')
        }
        refetch()
    }

    async function decryptSelectedSheets() {
        if (!profile?.isAdmin) return
        if (!confirm(`Rimuovere la crittografia da ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}?` + hiddenSelectedNote())) return
        const pw1 = prompt('Password per decrittazione') || ''
        if (!pw1) return
        const pw2 = prompt('Ripeti la password per conferma') || ''
        if (pw1 !== pw2) {
            alert('Le password non corrispondono')
            return
        }
        const password = pw1
        try {
            await decryptSheetsMutation({ variables: { sheetIds: selectedSheetIds.map(id => new ObjectId(id)), password } })
            alert('Decrittazione accodata al worker. Puoi seguirne lo stato nelle operazioni in background.')
        } catch (e) {
            alert(e instanceof globalThis.Error ? e.message : 'Errore durante la richiesta di decrittazione')
        }
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
        const updates = selectedSheets.map(sheet => ({
            _id: sheet._id,
            commonData: { ...sheet.commonData, [field]: value }
        }))
        await updateSheets({ variables: { sheets: updates } })
        refetch()
    }

    async function applyBulkPermission(email: string, role: 'manager' | 'editor' | 'viewer') {
        if (!profile?.isAdmin) return
        const emailTrimmed = (email || '').trim()
        if (!emailTrimmed || !emailTrimmed.includes('@')) return
        // Aggiorna i permessi su ciascun foglio: sostituisce eventuale entry per la stessa email
        await Promise.all(selectedSheets.map(async (sheet) => {
            const existing = (sheet.permissions || [])
            type PermInput = { email: string; role: 'manager'|'editor'|'viewer' }
            // Rimuovi l'eventuale permesso per la stessa email e pulisci i campi per l'input GraphQL (niente __typename)
            const kept: PermInput[] = existing
                .filter(p => p.email !== emailTrimmed)
                .map(p => ({ email: p.email, role: p.role as 'manager'|'editor'|'viewer' }))
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

    async function handleOlimanagerCreateParticipantsForSheets() {
        if (!confirm(`Creare/abbinare partecipanti su Olimanager per ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}? Il lavoro proseguirà in background.` + hiddenSelectedNote())) return
        try {
            await requestOlimanagerMatch({ variables: { sheetIds: selectedSheetIds.map(id => new ObjectId(id)) } })
        } catch { /* Apollo exposes the error above. */ }
    }

    async function handleOlimanagerBulkUpdateResults() {
        if (!confirm(`Inviare i risultati a Olimanager per ${pluralize(selectedSheetIds.length, 'foglio selezionato', 'fogli selezionati')}? Il lavoro proseguirà in background.` + hiddenSelectedNote())) return
        try {
            await requestOlimanagerResults({ variables: { sheetIds: selectedSheetIds.map(id => new ObjectId(id)) } })
        } catch { /* Apollo exposes the error above. */ }
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
        {/* Obsolete: entry point of SheetsCreation. */}
        { sheet.schema === 'scuole' && profile?.isAdmin && selected &&
            <td>
                <Button disabled={creationDisabled} onClick={() => startCreation(sheet._id)}>
                    ⚙ crea fogli
                </Button>
            </td>
        }
    </tr>
}

function BulkCommonDataSetter({sheets, hiddenCount, onApply}:{
    sheets: Partial<Sheet>[],
    hiddenCount: number,
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
        </Button> su {pluralize(sheets.length, 'foglio', 'fogli')}<HiddenCount count={hiddenCount} />
    </div>
}

function BulkPermissionSetter({sheets, hiddenCount, onApply}:{
    sheets: Partial<Sheet>[],
    hiddenCount: number,
    onApply: (email: string, role: 'manager'|'editor'|'viewer') => Promise<void>
}) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<'manager'|'editor'|'viewer'>('editor')
    const [loading, setLoading] = useState(false)

    const ROLE_LABELS: Record<'manager'|'editor'|'viewer', string> = {
        manager: 'responsabile',
        editor: 'aiutante',
        viewer: 'osservatore'
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
                    <select className="p-1" value={role} onChange={e => setRole(e.target.value as 'manager'|'editor'|'viewer')}>
                        {(['manager','editor','viewer'] as const).map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                    </select>
                </td>
            </tr>
            </tbody>
        </table>
        <Button disabled={loading || !email.trim()} onClick={handleApply}>
            ⚙ Concedi
        </Button> su {pluralize(sheets.length, 'foglio', 'fogli')}<HiddenCount count={hiddenCount} />
    </div>
}

function HiddenCount({ count }: { count: number }) {
    if (count === 0) return null
    return <> ({pluralize(count, 'uno non visibile', '% non visibili')})</>
}
