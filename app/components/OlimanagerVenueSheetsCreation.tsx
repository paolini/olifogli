import { gql } from '@apollo/client'
import { useState } from 'react'
import { ObjectId } from 'bson'
import { useGetWorkbookQuery, useGetSheetsQuery, useOlimanagerVenueSheetChoicesQuery, usePrepareOlimanagerVenueSheetsMutation, useAddSheetsMutation, useUpdateSheetMutation, type GetSheetsQuery } from '../graphql/generated'
import { SHEET_CONTEST_KEY, VENUE_SHEET_SCHEMAS, isVenueSheetSchema } from '../lib/olimanagerVenueSheetConfig'
import { venueSheetPlan, sheetContest, samePermissions, applyPermissionChanges } from '../lib/olimanagerVenueSheetPlan'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'

const CHOICES = gql`
    query OlimanagerVenueSheetChoices {
        olimanagerVenueSheetChoices { id name editions { id name year contests { id name scope } } }
    }
`
const PREPARE = gql`
    mutation PrepareOlimanagerVenueSheets($workbookId: ObjectId!, $olympiadId: String!, $editionId: String!, $schema: String!, $contestId: Int!) {
        prepareOlimanagerVenueSheets(workbookId: $workbookId, olympiadId: $olympiadId, editionId: $editionId, schema: $schema, contestId: $contestId) {
            sheets { name schema commonData permissions { email role } }
            warnings
        }
    }
`

// Selection key of a sheet's contest assignment; never a valid email.
const CONTEST_CHANGE = '#contest'

// Background of the status cell and of the summary entries; unchanged sheets stay white.
const ACTION_COLORS: Record<string, string> = { create: 'bg-green-100', update: 'bg-yellow-100', conflict: 'bg-red-100', unchanged: '' }

export default function OlimanagerVenueSheetsCreation({ workbookId, done }: { workbookId: ObjectId, done: () => void }) {
    const workbook = useGetWorkbookQuery({ variables: { workbookId } })
    const existing = useGetSheetsQuery({ variables: { workbookId } })
    const choices = useOlimanagerVenueSheetChoicesQuery()
    const [prepare, preparation] = usePrepareOlimanagerVenueSheetsMutation()
    const [addSheets, creation] = useAddSheetsMutation()
    const [updateSheet, updating] = useUpdateSheetMutation()
    type Selection = { olympiadId: string, editionId: string, schema: string, contestId: string }
    const [selection, setSelection] = useState<Selection | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set())
    const [failure, setFailure] = useState('')
    const [snapshot, setSnapshot] = useState<GetSheetsQuery['sheets']>([])
    const [applying, setApplying] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [previewReady, setPreviewReady] = useState(false)
    const [hideUnchanged, setHideUnchanged] = useState(false)
    const olympiads = choices.data?.olimanagerVenueSheetChoices
    const config = workbook.data?.workbook?.commonData || {}
    const initialSelection: Selection = { olympiadId: String(config.olimanager_olympiad_id || ''), editionId: String(config.olimanager_edition_id || ''), schema: '', contestId: '' }
    const { olympiadId, editionId, schema, contestId } = selection || initialSelection
    const configurationChanged = olympiadId !== initialSelection.olympiadId || editionId !== initialSelection.editionId
    const change = (fields: Partial<Selection>) => { setSelection(prev => ({ ...(prev || initialSelection), ...fields })); resetPreview() }

    const edition = olympiads?.find(o => o.id === olympiadId)?.editions.find(e => e.id === editionId)
    // Each schema accepts contests of one scope (SCHOOL or ZONE).
    const contestsFor = (schema: string) => isVenueSheetSchema(schema) ? edition?.contests.filter(c => c.scope === VENUE_SHEET_SCHEMAS[schema].scope) || [] : []
    const contests = contestsFor(schema)
    // Propose the contest already assigned to the sheets of the chosen schema, if it is unique.
    function contestOf(schema: string) {
        const used = new Set((existing.data?.sheets || []).filter(s => s.schema === schema).map(sheetContest).filter(Boolean))
        return used.size === 1 && contestsFor(schema).some(c => String(c.id) === [...used][0]) ? [...used][0] : ''
    }
    const preview = previewReady ? preparation.data?.prepareOlimanagerVenueSheets : undefined
    const busy = preparation.loading || creation.loading || updating.loading || applying || loadingPreview
    const plan = venueSheetPlan(preview?.sheets || [], snapshot)
    const actionable = plan.filter(p => p.action === 'create' || p.action === 'update')
    const changeKey = (sheetKey: string, item: string) => JSON.stringify([sheetKey, item])
    const changeKeys = (p: typeof plan[number]) => [...(p.assignContest ? [changeKey(p.key, CONTEST_CHANGE)] : []), ...p.changes.map(c => changeKey(p.key, c.email))]
    const checkedChanges = (p: typeof plan[number]) => p.changes.filter(c => selectedChanges.has(changeKey(p.key, c.email)))
    const contestChecked = (p: typeof plan[number]) => p.assignContest && selectedChanges.has(changeKey(p.key, CONTEST_CHANGE))
    const checkedCount = (p: typeof plan[number]) => changeKeys(p).filter(k => selectedChanges.has(k)).length
    const isChecked = (p: typeof plan[number]) => p.action === 'create' ? selected.has(p.key) : p.action === 'update' && checkedCount(p) === changeKeys(p).length
    const selectedPlan = actionable.filter(p => p.action === 'create' ? selected.has(p.key) : checkedCount(p) > 0)
    function selectChanges(keys: string[], checked: boolean) {
        setSelectedChanges(prev => {
            const next = new Set(prev)
            for (const key of keys) { if (checked) next.add(key); else next.delete(key) }
            return next
        })
    }
    const newCount = plan.filter(p => p.action === 'create').length
    const updateCount = plan.filter(p => p.action === 'update').length
    const roleLabel = (role: string) => ({ manager: 'responsabile', editor: 'aiutante', viewer: 'osservatore' }[role] || role)
    function resetPreview() { preparation.reset(); setPreviewReady(false); setFailure('') }

    if (workbook.loading || choices.loading || existing.loading) return <Loading />
    const error = workbook.error || choices.error || existing.error || preparation.error || creation.error || updating.error
    const appliedPermissionChanges = selectedPlan.filter(p => p.action === 'update').reduce((n, p) => n + checkedChanges(p).length, 0)
    const appliedContests = selectedPlan.filter(contestChecked).length
    return <div className="space-y-3">
        <p>Creazione fogli per sede (venue) da Olimanager. Ogni foglio è associato a un contest: per Archimede si esegue una volta per il Biennio e una per il Triennio. Per le gare scolastiche c’è un foglio per ogni scuola iscritta, per quelle distrettuali (come la gara delle prime) uno per ogni venue del contest.</p>
        <Error error={error || failure} />
        <div className="flex flex-wrap gap-3">
            <label>Olimpiade <select disabled={busy} value={olympiadId} onChange={e => change({ olympiadId: e.target.value, editionId: '', contestId: '' })}>
                <option value="">Seleziona olimpiade</option>
                {olympiads?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>
            <label>Edizione <select disabled={busy || !olympiadId} value={editionId} onChange={e => change({ editionId: e.target.value, contestId: '' })}>
                <option value="">Seleziona edizione</option>
                {olympiads?.find(o => o.id === olympiadId)?.editions.map(e => <option key={e.id} value={e.id}>{e.name}{e.year ? ` (${e.year})` : ''}</option>)}
            </select></label>
            <label>Schema <select disabled={busy} value={schema} onChange={e => change({ schema: e.target.value, contestId: contestOf(e.target.value) })}>
                <option value="">Seleziona schema</option>
                {Object.entries(VENUE_SHEET_SCHEMAS).map(([name, { label }]) => <option key={name} value={name}>{label}</option>)}
            </select></label>
            <label>Contest <select disabled={busy || !editionId || !schema} value={contestId} onChange={e => change({ contestId: e.target.value })}>
                <option value="">Seleziona contest</option>
                {contests.map(c => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}
            </select></label>
        </div>
        {configurationChanged && <p>Olimpiade ed edizione vengono salvate nella configurazione del raccoglitore caricando l’anteprima.</p>}
        <Button disabled={busy || !olympiadId || !editionId || !isVenueSheetSchema(schema) || !contests.some(c => String(c.id) === contestId)} onClick={async () => {
            try {
                setLoadingPreview(true)
                setPreviewReady(false)
                setFailure('')
                const result = await prepare({ variables: { workbookId, olympiadId, editionId, schema, contestId: Number(contestId) }, refetchQueries: ['GetWorkbook'] })
                const current = await existing.refetch()
                setSnapshot(current.data.sheets)
                // Changes to existing sheets require explicit selection in the preview.
                setSelected(new Set(venueSheetPlan(result.data?.prepareOlimanagerVenueSheets.sheets || [], current.data.sheets).filter(p => p.action === 'create').map(p => p.key)))
                setSelectedChanges(new Set())
                setPreviewReady(true)
            } catch { /* Error displayed above. */ }
            finally { setLoadingPreview(false) }
        }}>{configurationChanged ? 'Salva configurazione e carica anteprima' : 'Carica anteprima'}</Button>
        <Button variant="secondary" disabled={busy} onClick={done}>Annulla</Button>
        {preview && <>
            {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
            <p>
                <span className={`${ACTION_COLORS.create} px-1`}>{newCount} fogli da creare</span>;{' '}
                <span className={`${ACTION_COLORS.update} px-1`}>{updateCount} da aggiornare</span>;{' '}
                {plan.filter(p => p.action === 'unchanged').length} invariati;{' '}
                <span className={`${ACTION_COLORS.conflict} px-1`}>{plan.filter(p => p.action === 'conflict').length} in conflitto</span>.
            </p>
            {updateCount > 0 && <p>Seleziona le singole modifiche da applicare. Gli accessi non selezionati vengono conservati, inclusi quelli degli aiutanti aggiunti a mano. La casella del foglio seleziona tutte le sue modifiche, comprese le rimozioni.</p>}
            <label><input type="checkbox" disabled={busy || !actionable.length} checked={actionable.length > 0 && actionable.every(isChecked)} onChange={e => {
                setSelected(new Set(e.target.checked ? actionable.filter(p => p.action === 'create').map(p => p.key) : []))
                setSelectedChanges(new Set(e.target.checked ? actionable.flatMap(changeKeys) : []))
            }} /> Seleziona tutte le creazioni e tutte le modifiche (incluse le rimozioni)</label>
            <label className="ml-6"><input type="checkbox" checked={hideUnchanged} onChange={e => setHideUnchanged(e.target.checked)} /> Nascondi righe invariate</label>
            <table><thead><tr><th></th><th>Sede</th><th>Distretto</th><th>Permessi attuali</th><th>Permessi Olimanager</th><th>Modifiche</th><th>Stato</th></tr></thead><tbody>
                {plan.filter(p => !hideUnchanged || p.action !== 'unchanged').map(p => { const s = p.candidate; return <tr key={p.key}>
                    <td><input type="checkbox" aria-label={`Seleziona ${s.name} ${s.schema}`} disabled={busy || p.action === 'unchanged' || p.action === 'conflict'} checked={isChecked(p)} ref={node => { if (node) node.indeterminate = p.action === 'update' && checkedCount(p) > 0 && !isChecked(p) }} onChange={e => {
                        if (p.action === 'update') selectChanges(changeKeys(p), e.target.checked)
                        else setSelected(prev => {
                            const next = new Set(prev); if (e.target.checked) next.add(p.key); else next.delete(p.key); return next
                        })
                    }} /></td>
                    <td>{s.name}{s.commonData.Nome_scuola ? ` — ${s.commonData.Nome_scuola}` : ''}</td><td>{s.commonData.Distretto}</td>
                    <td>{p.sheet?.permissions.map(p => `${p.email} (${roleLabel(p.role)})`).join(', ') || '—'}</td>
                    <td>{s.permissions.map(p => `${p.email} (${roleLabel(p.role)})`).join(', ') || '—'}</td>
                    <td>{p.action === 'create' ? 'Nuovi accessi indicati nella colonna Olimanager' : p.action === 'update' ? <ul>
                        {p.assignContest && <li><label>
                            <input type="checkbox" disabled={busy} checked={contestChecked(p)} onChange={e => selectChanges([changeKey(p.key, CONTEST_CHANGE)], e.target.checked)} />{' '}
                            associa al contest #{sheetContest(s)}
                        </label></li>}
                        {p.changes.map(c => <li key={c.email}><label>
                            <input type="checkbox" disabled={busy} checked={selectedChanges.has(changeKey(p.key, c.email))} onChange={e => selectChanges([changeKey(p.key, c.email)], e.target.checked)} />{' '}
                            {c.email}: {c.previousRole && c.role ? `${roleLabel(c.previousRole)} → ${roleLabel(c.role)}` : c.role ? `aggiungi (${roleLabel(c.role)})` : `rimuovi (${roleLabel(c.previousRole!)})`}
                        </label></li>)}
                    </ul> : '—'}</td>
                    <td className={ACTION_COLORS[p.action]}>{p.action === 'conflict' ? p.reason : { create: 'nuovo', update: 'aggiorna', unchanged: 'invariato' }[p.action]}</td>
                </tr>})}
            </tbody></table>
            <Button disabled={busy || !selectedPlan.length} onClick={async () => {
                try {
                    setApplying(true)
                    setFailure('')
                    const current = await existing.refetch()
                    // Recheck the reviewed sheets before making any writes.
                    for (const p of selectedPlan) {
                        const latest = venueSheetPlan([p.candidate], current.data.sheets)[0]
                        const changed = p.sheet
                            ? latest.sheet?._id.toString() !== p.sheet._id.toString() || !samePermissions(latest.sheet.permissions, p.sheet.permissions) || sheetContest(latest.sheet) !== sheetContest(p.sheet)
                            : !!latest.sheet
                        if (latest.action === 'conflict' || changed) {
                            throw new globalThis.Error(`Il foglio ${p.candidate.name} è cambiato dopo l’anteprima. Ricarica l’anteprima prima di procedere.`)
                        }
                    }
                    for (const p of selectedPlan.filter(p => p.action === 'update')) {
                        const sheet = current.data.sheets.find(s => s._id.toString() === p.sheet!._id.toString())!
                        const emails = checkedChanges(p).map(c => c.email)
                        await updateSheet({ variables: {
                            _id: p.sheet!._id,
                            ...(emails.length ? { permissions: applyPermissionChanges(p.sheet!.permissions, p.candidate.permissions, emails).map(p => ({ email: p.email, role: p.role })) } : {}),
                            ...(contestChecked(p) ? { commonData: { ...sheet.commonData, [SHEET_CONTEST_KEY]: sheetContest(p.candidate) } } : {}),
                        } })
                    }
                    const candidates = selectedPlan.filter(p => p.action === 'create').map(p => p.candidate)
                    if (candidates.length) await addSheets({ variables: { sheets: candidates.map(s => ({
                        workbookId, name: s.name, schema: s.schema, commonData: s.commonData,
                        permissions: s.permissions.map(p => ({ email: p.email, role: p.role })),
                    })) } })
                    await existing.refetch()
                    done()
                } catch (error) { setFailure(error instanceof globalThis.Error ? error.message : String(error)) }
                finally { setApplying(false) }
            }}>Crea {selectedPlan.filter(p => p.action === 'create').length} fogli, associa {appliedContests} fogli al contest e applica {appliedPermissionChanges} modifiche ai permessi</Button>
        </>}
    </div>
}
