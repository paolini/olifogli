import { gql } from '@apollo/client'
import { useState } from 'react'
import { ObjectId } from 'bson'
import { useGetWorkbookQuery, useGetSheetsQuery, useOlimanagerVenueSheetChoicesQuery, usePrepareOlimanagerVenueSheetsMutation, useAddSheetsMutation, useUpdateSheetMutation, type GetSheetsQuery } from '../graphql/generated'
import { ARCHIMEDE_CONTEST_KEYS } from '../lib/olimanagerVenueSheetConfig'
import { venueSheetPlan, samePermissions, applyPermissionChanges } from '../lib/olimanagerVenueSheetPlan'
import Button from './Button'
import Error from './Error'
import Loading from './Loading'

const CHOICES = gql`
    query OlimanagerVenueSheetChoices {
        olimanagerVenueSheetChoices { id name editions { id name year contests { id name scope } } }
    }
`
const PREPARE = gql`
    mutation PrepareOlimanagerVenueSheets($workbookId: ObjectId!, $olympiadId: String!, $biennioContestId: Int!, $triennioContestId: Int!) {
        prepareOlimanagerVenueSheets(workbookId: $workbookId, olympiadId: $olympiadId, biennioContestId: $biennioContestId, triennioContestId: $triennioContestId) {
            sheets { name schema commonData permissions { email role } }
            warnings
        }
    }
`

export default function OlimanagerVenueSheetsCreation({ workbookId, done }: { workbookId: ObjectId, done: () => void }) {
    const workbook = useGetWorkbookQuery({ variables: { workbookId } })
    const existing = useGetSheetsQuery({ variables: { workbookId } })
    const choices = useOlimanagerVenueSheetChoicesQuery()
    const [prepare, preparation] = usePrepareOlimanagerVenueSheetsMutation()
    const [addSheets, creation] = useAddSheetsMutation()
    const [updateSheet, updating] = useUpdateSheetMutation()
    type Selection = { olympiadId: string, editionId: string, biennio: string, triennio: string }
    const [selection, setSelection] = useState<Selection | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set())
    const [failure, setFailure] = useState('')
    const [snapshot, setSnapshot] = useState<GetSheetsQuery['sheets']>([])
    const [applying, setApplying] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [previewReady, setPreviewReady] = useState(false)
    const olympiads = choices.data?.olimanagerVenueSheetChoices
    const initialSelection = (() => {
        const config = workbook.data?.workbook?.commonData || {}
        const b = String(config[ARCHIMEDE_CONTEST_KEYS.biennio] || '')
        const t = String(config[ARCHIMEDE_CONTEST_KEYS.triennio] || '')
        // Infer the olympiad/edition for older workbooks storing only contest IDs.
        const olympiad = olympiads?.find(o => o.id === config.olimanager_olympiad_id)
            || olympiads?.find(o => o.editions.some(e => e.contests.some(c => String(c.id) === b)))
        const edition = olympiad?.editions.find(e => e.id === config.olimanager_edition_id)
            || olympiad?.editions.find(e => e.contests.some(c => String(c.id) === b))
        return { olympiadId: olympiad?.id || '', editionId: edition?.id || '', biennio: b, triennio: t }
    })()
    const { olympiadId, editionId, biennio, triennio } = selection || initialSelection
    const configurationChanged = olympiadId !== initialSelection.olympiadId
        || editionId !== initialSelection.editionId
        || biennio !== initialSelection.biennio
        || triennio !== initialSelection.triennio
    const change = (field: keyof Selection, value: string) => setSelection(prev => ({ ...(prev || initialSelection), [field]: value }))
    const setOlympiadId = (value: string) => change('olympiadId', value)
    const setEditionId = (value: string) => change('editionId', value)
    const setBiennio = (value: string) => change('biennio', value)
    const setTriennio = (value: string) => change('triennio', value)

    const edition = olympiads?.find(o => o.id === olympiadId)?.editions.find(e => e.id === editionId)
    const contests = edition?.contests.filter(c => c.scope === 'SCHOOL') || []
    const preview = previewReady ? preparation.data?.prepareOlimanagerVenueSheets : undefined
    const busy = preparation.loading || creation.loading || updating.loading || applying || loadingPreview
    const plan = venueSheetPlan(preview?.sheets || [], snapshot)
    const actionable = plan.filter(p => p.action === 'create' || p.action === 'update')
    const changeKey = (sheetKey: string, email: string) => JSON.stringify([sheetKey, email])
    const checkedChanges = (p: typeof plan[number]) => p.changes.filter(c => selectedChanges.has(changeKey(p.key, c.email)))
    const isChecked = (p: typeof plan[number]) => p.action === 'create' ? selected.has(p.key) : p.action === 'update' && checkedChanges(p).length === p.changes.length
    const selectedPlan = actionable.filter(p => p.action === 'create' ? selected.has(p.key) : checkedChanges(p).length > 0)
    function selectChanges(keys: string[], checked: boolean) {
        setSelectedChanges(prev => {
            const next = new Set(prev)
            for (const key of keys) { if (checked) next.add(key); else next.delete(key) }
            return next
        })
    }
    const newCount = plan.filter(p => p.action === 'create').length
    const updateCount = plan.filter(p => p.action === 'update').length
    const roleLabel = (role: string) => ({ admin: 'amministratore', editor: 'editor', view: 'supervisore', owner: 'proprietario' }[role] || role)
    function resetPreview() { preparation.reset(); setPreviewReady(false); setFailure('') }

    if (workbook.loading || choices.loading || existing.loading) return <Loading />
    const error = workbook.error || choices.error || existing.error || preparation.error || creation.error || updating.error
    return <div className="space-y-3">
        <p>Creazione fogli per sede (venue) da Olimanager — Archimede</p>
        <Error error={error || failure} />
        <div className="flex flex-wrap gap-3">
            <label>Olimpiade <select disabled={busy} value={olympiadId} onChange={e => {
                setOlympiadId(e.target.value); setEditionId(''); setBiennio(''); setTriennio(''); resetPreview()
            }}>
                <option value="">Seleziona olimpiade</option>
                {olympiads?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>
            <label>Edizione <select disabled={busy || !olympiadId} value={editionId} onChange={e => {
                setEditionId(e.target.value); setBiennio(''); setTriennio(''); resetPreview()
            }}>
                <option value="">Seleziona edizione</option>
                {olympiads?.find(o => o.id === olympiadId)?.editions.map(e => <option key={e.id} value={e.id}>{e.name}{e.year ? ` (${e.year})` : ''}</option>)}
            </select></label>
            {(['Biennio', 'Triennio'] as const).map(category => <label key={category}>{category} <select
                disabled={busy || !editionId} value={category === 'Biennio' ? biennio : triennio}
                onChange={e => { (category === 'Biennio' ? setBiennio : setTriennio)(e.target.value); resetPreview() }}>
                <option value="">Seleziona contest</option>
                {contests.map(c => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}
            </select></label>)}
        </div>
        {configurationChanged && <p>Olimpiade, edizione e contest vengono salvati nella configurazione del raccoglitore caricando l’anteprima.</p>}
        <Button disabled={busy || !olympiadId || !editionId || !contests.some(c => String(c.id) === biennio) || !contests.some(c => String(c.id) === triennio) || biennio === triennio} onClick={async () => {
            try {
                setLoadingPreview(true)
                setPreviewReady(false)
                setFailure('')
                const result = await prepare({ variables: { workbookId, olympiadId, biennioContestId: Number(biennio), triennioContestId: Number(triennio) }, refetchQueries: ['GetWorkbook'] })
                const current = await existing.refetch()
                setSnapshot(current.data.sheets)
                // Permission removals/role changes require explicit selection in the preview.
                setSelected(new Set(venueSheetPlan(result.data?.prepareOlimanagerVenueSheets.sheets || [], current.data.sheets).filter(p => p.action === 'create').map(p => p.key)))
                setSelectedChanges(new Set())
                setPreviewReady(true)
            } catch { /* Error displayed above. */ }
            finally { setLoadingPreview(false) }
        }}>{configurationChanged ? 'Salva configurazione e carica anteprima' : 'Carica anteprima'}</Button>
        <Button disabled={busy} onClick={done}>Annulla</Button>
        {preview && <>
            {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
            <p>{newCount} fogli da creare; {updateCount} da aggiornare; {plan.filter(p => p.action === 'unchanged').length} invariati.</p>
            {updateCount > 0 && <p>Seleziona le singole modifiche da applicare. Gli accessi non selezionati vengono conservati, inclusi quelli degli aiutanti aggiunti a mano. La casella del foglio seleziona tutte le sue modifiche, comprese le rimozioni.</p>}
            <label><input type="checkbox" disabled={busy || !actionable.length} checked={actionable.length > 0 && actionable.every(isChecked)} onChange={e => {
                setSelected(new Set(e.target.checked ? actionable.filter(p => p.action === 'create').map(p => p.key) : []))
                setSelectedChanges(new Set(e.target.checked ? actionable.flatMap(p => p.changes.map(c => changeKey(p.key, c.email))) : []))
            }} /> Seleziona tutte le creazioni e tutte le modifiche (incluse le rimozioni)</label>
            <table><thead><tr><th></th><th>Sede</th><th>Categoria</th><th>Distretto</th><th>Permessi attuali</th><th>Permessi Olimanager</th><th>Modifiche ai permessi</th><th>Stato</th></tr></thead><tbody>
                {plan.map(p => { const s = p.candidate; return <tr key={p.key}>
                    <td><input type="checkbox" aria-label={`Seleziona ${s.name} ${s.schema}`} disabled={busy || p.action === 'unchanged' || p.action === 'conflict'} checked={isChecked(p)} ref={node => { if (node) node.indeterminate = p.action === 'update' && checkedChanges(p).length > 0 && !isChecked(p) }} onChange={e => {
                        if (p.action === 'update') selectChanges(p.changes.map(c => changeKey(p.key, c.email)), e.target.checked)
                        else setSelected(prev => {
                            const next = new Set(prev); if (e.target.checked) next.add(p.key); else next.delete(p.key); return next
                        })
                    }} /></td>
                    <td>{s.name} — {s.commonData.Nome_scuola}</td><td>{s.schema === 'archimede_biennio' ? 'Biennio' : 'Triennio'}</td><td>{s.commonData.Distretto}</td>
                    <td>{p.sheet?.permissions.map(p => `${p.email} (${roleLabel(p.role)})`).join(', ') || '—'}</td>
                    <td>{s.permissions.map(p => `${p.email} (${roleLabel(p.role)})`).join(', ') || '—'}</td>
                    <td>{p.action === 'create' ? 'Nuovi accessi indicati nella colonna Olimanager' : p.changes.length ? <ul>{p.changes.map(c => <li key={c.email}><label>
                        <input type="checkbox" disabled={busy} checked={selectedChanges.has(changeKey(p.key, c.email))} onChange={e => selectChanges([changeKey(p.key, c.email)], e.target.checked)} />{' '}
                        {c.email}: {c.previousRole && c.role ? `${roleLabel(c.previousRole)} → ${roleLabel(c.role)}` : c.role ? `aggiungi (${roleLabel(c.role)})` : `rimuovi (${roleLabel(c.previousRole!)})`}
                    </label></li>)}</ul> : '—'}</td>
                    <td>{{ create: 'nuovo', update: 'aggiorna permessi', unchanged: 'invariato', conflict: 'più fogli corrispondenti: risolvere i duplicati' }[p.action]}</td>
                </tr>})}
            </tbody></table>
            <Button disabled={busy || !selectedPlan.length} onClick={async () => {
                try {
                    setApplying(true)
                    setFailure('')
                    const current = await existing.refetch()
                    // Recheck the reviewed permissions before making any writes.
                    for (const p of selectedPlan) {
                        const latest = venueSheetPlan([p.candidate], current.data.sheets)[0]
                        if (latest.action === 'conflict' || (p.sheet ? latest.sheet?._id.toString() !== p.sheet._id.toString() || !samePermissions(latest.sheet.permissions, p.sheet.permissions) : !!latest.sheet)) {
                            throw new globalThis.Error(`Il foglio ${p.candidate.name} è cambiato dopo l’anteprima. Ricarica l’anteprima prima di procedere.`)
                        }
                    }
                    for (const p of selectedPlan.filter(p => p.action === 'update')) {
                        const permissions = applyPermissionChanges(p.sheet!.permissions, p.candidate.permissions, checkedChanges(p).map(c => c.email))
                        await updateSheet({ variables: { _id: p.sheet!._id, permissions: permissions.map(p => ({ email: p.email, role: p.role })) } })
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
            }}>Crea {selectedPlan.filter(p => p.action === 'create').length} fogli e applica {selectedPlan.filter(p => p.action === 'update').reduce((n, p) => n + checkedChanges(p).length, 0)} modifiche ai permessi</Button>
        </>}
    </div>
}
