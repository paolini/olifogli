import { ObjectId } from 'bson'
import { useEffect, useState } from 'react'
import { useGetSheetsQuery, useGetRowsQuery, Row, Sheet, useAddSheetsMutation, useUpdateSheetsMutation, Permission } from '../graphql/generated'
import Error from './Error'
import Button from './Button'
import { Data } from '../lib/models'
import Loading from './Loading'
import { gql } from '@apollo/client'
import { pluralize } from '../lib/util'

type Job = {
    rowId: ObjectId|null,
    sheet: Partial<Sheet>|null,
    name: string,
    schema: "archimede_biennio"|"archimede_triennio",
    permissions: Permission[],
    commonData: Data,
    action?: string,
    selected?: boolean
    messages?: string[]
}

/**
 * Questa componente visualizza le righe del foglio selezionato 
 * e permette di creare nuovi fogli "archimede" a partire dalle righe
 * stesse. Usa le colonne per dare i permessi agli utenti.
 */

export default function SchoolSheetsCreation({ sheetId, workbookId, done }: {
    sheetId: ObjectId,
    workbookId: ObjectId,
    done: () => void
}) {
    const { data: sheetsData, loading: sheetsLoading, error: sheetsError } = useGetSheetsQuery({ variables: { workbookId } })
    const { data: rowsData, loading: rowsLoading, error: rowsError } = useGetRowsQuery({ variables: { sheetId } })
    const sheets: Partial<Sheet>[]|undefined = sheetsData?.sheets
    const rows: Row[]|undefined = rowsData?.rows

    return <div className="space-y-2">
        { rowsLoading && <div>caricamento righe...</div> }
        <Error error={rowsError} />
        { rows && <div>numero righe: {rows.length}</div>}
        <Button onClick={done}>annulla</Button>
        { sheetsLoading && <div>caricamento fogli...</div> }
        <Error error={sheetsError} />
        { sheets && rows && 
            <Process jobsCallback={jobs} workbookId={workbookId} done={done}/>
        }
    </div>

    async function jobs() {
        if (!rows || !sheets) throw "error"
        console.log('=== INIZIO PROCESSING JOBS ===')
        console.log(`Sheets totali: ${sheets.length}`)
        console.log(`Rows totali: ${rows.length}`)
        const jobs: Record<string,Job> = {}

        function addJob(job: Job) {
            const id = job.name + '-' + job.schema
            const existing = jobs[id]
            const DEBUG_CODE = 'FEPS01000N'
            const shouldLog = job.name.includes(DEBUG_CODE)
            
            if (!existing) {
                // Nuovo job: viene creato
                jobs[id] = {
                    ...job,
                    action: 'crea',
                    selected: job.permissions.length > 0,
                    messages: []
                }
                if (shouldLog) console.log(`[${job.name}] ${job.schema}: crea (nuovo)`, {permissions: job.permissions, commonData: job.commonData, hasSheet: !!job.sheet})
            } else {
                if (existing.action === 'crea') {
                    let modified = false
                    const modifications: string[] = []
                    // Il job esiste ed è in stato "crea": lo aggiorniamo
                    existing.rowId = job.rowId
                    // Merge permissions avoiding duplicates
                    const mergedPermissions = [...existing.permissions]
                    for (const p of existing.permissions) {
                        const match = job.permissions.find(np => 
                            (p.email && np.email && p.email === np.email) ||
                            (p.userId && np.userId && p.userId.equals(np.userId))
                        )
                        if (!match) {
                            modifications.push(`(!) rimosso permesso ${p.email || p.userId} (${p.role})`)
                        }
                    }
                    for (const newPerm of job.permissions) {
                        const exists = mergedPermissions.some(p => 
                            (p.email && newPerm.email && p.email === newPerm.email) ||
                            (p.userId && newPerm.userId && p.userId.equals(newPerm.userId))
                        )
                        if (!exists) {
                            mergedPermissions.push(newPerm)
                            modified = true
                            modifications.push(`aggiunto permesso ${newPerm.email || newPerm.userId} (${newPerm.role})`)
                        }
                    }
                    existing.permissions = mergedPermissions

                    for (const [k, v] of Object.entries(job.commonData)) {
                        if (existing.commonData[k] !== v) {
                            existing.commonData[k] = v
                            modified = true
                            modifications.push(`commonData.${k} cambiato da "${existing.commonData[k]}" a "${v}"`)
                        }
                    }
                    if (modified) {    
                        existing.action = 'aggiorna'
                    } else {
                        existing.action = 'immutato'
                        existing.selected = false
                    }
                    existing.messages = [...existing.messages || [], ...modifications]
                    if (shouldLog) console.log(`[${job.name}] ${job.schema}: aggiorna (era "crea")`, {permissions: job.permissions, hasSheet: !!job.sheet, rowId: job.rowId})
                } else {
                    // Il job esiste ed è già stato aggiornato: duplicato
                    existing.action = 'duplicato'
                    existing.selected = false
                    if (shouldLog) console.log(`[${job.name}] ${job.schema}: duplicato (era "${existing.action}")`, {permissions: job.permissions, hasSheet: !!job.sheet, rowId: job.rowId})
                }
            }
        }

        console.log('--- Processing sheets esistenti ---')
        for (const sheet of sheets) {
            if (sheet.schema !=='archimede_biennio' && sheet.schema !== 'archimede_triennio') continue
            addJob({
                sheet,
                rowId: null,
                schema: sheet.schema,
                name: (sheet.name || ''),
                permissions: sheet.permissions || [],
                commonData: {...sheet.commonData}
            })
        }

        console.log('--- Processing rows CSV ---')
        for (const row of rows || []) {
            const codice_meccanografico = row.data?.Codice_meccanografico || ''
            const email = row.data?.Email_referente || ''
            // Coordinatori: stringa singola con email separati da virgola
            let coordinatori: string[] = [];
            const rawCoordinatori = row.data?.Email_coordinatori || '';
            coordinatori = rawCoordinatori.split(',').filter(Boolean).map((c: string) => c.trim());
            const permissions: Permission[] = [];
            if (email) permissions.push({ email, role: 'admin' });
            for (const coord of coordinatori) {
                if (coord && coord !== email) {
                    permissions.push({ email: coord, role: 'view' });
                }
            }
            for (const schema of ['archimede_biennio', 'archimede_triennio'] as const) {
                addJob({
                    rowId: row._id,
                    name: codice_meccanografico,
                    schema,
                    permissions,
                    sheet: null,
                    commonData: {
                        Codice_meccanografico: codice_meccanografico || '',
                        Nome_scuola: row.data?.Nome_scuola || '',
                        "Città_scuola": row.data["Città_scuola"] || '',
                        "Distretto":  (row.data["Nome_distretto"] || '').replace('Distretto di ',''),
                    }
                })
            }
        }
        return jobs
    }
}

export const ADD_SHEETS = gql`
  mutation AddSheets($sheets: [SheetInput!]!) {
    addSheets(sheets: $sheets)
  }
`

export const UPDATE_SHEETS = gql`
  mutation UpdateSheets($sheets: [UpdateSheetInput!]!) {
    updateSheets(sheets: $sheets)
  }
`

function Process({jobsCallback, workbookId, done}: {
    jobsCallback: () => Promise<Record<string,Job>>,
    workbookId: ObjectId
    done: () => void
}) {
    const [createSheets, {loading: loadingCreate, error: errorCreate}] = useAddSheetsMutation()
    const [updateSheetsMutation, {loading: loadingUpdate, error: errorUpdate}] = useUpdateSheetsMutation()
    const [jobs, setJobs] = useState<null|Record<string,Job>>(null)
    const [filterUnchanged, setFilterUnchanged] = useState(false)
    
    const loading = loadingCreate || loadingUpdate
    const error = errorCreate || errorUpdate
    
    useEffect(() => {
        jobsCallback().then(setJobs)
    }, [jobsCallback])

    if (jobs === null) return <Loading />
    return <>
        <Button className="mx-2" disabled={loading} onClick={go} >
            procedi
        </Button>
        {} crea {pluralize(Object.values(jobs).filter(job => job.selected && job.action === 'crea').length,"foglio","fogli")},
        {} aggiorna {pluralize(Object.values(jobs).filter(job => job.selected && job.action === 'aggiorna').length,"foglio","fogli")}
        <label className="mx-4">
            <input type="checkbox" checked={filterUnchanged} onChange={() => setFilterUnchanged(v => !v)}/>
            {} nascondi immutati/duplicati
        </label>
        <Error error={error}/>
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>azione</th>
                    <th>schema</th>
                    <th>codice</th>
                    <th>referenti</th>
                    <th>scuola</th>
                    <th>città</th>
                    <th>distretto</th>
                    <th>messaggi</th>
                </tr>
            </thead>
            <tbody>
                {Object.values(jobs)
                    .filter(job => (!filterUnchanged || !["immutato","duplicato"].includes(job.action || '')))
                    .map(job => 
                <tr key={job.name+'-'+job.schema}>
                <td>
                    <input 
                        type="checkbox" 
                        checked={job.selected} 
                        onChange={() => {
                            setJobs(jobs => {
                                if (!jobs) return jobs
                                const id = job.name + '-' + job.schema
                                return {
                                    ...jobs,
                                    [id]: {
                                        ...jobs[id],
                                        selected: !jobs[id].selected
                                    }
                                }
                            })
                        }}
                        />
                </td>
                <td>
                    {job.action}
                </td>
                <td>
                    {job.schema}
                </td>
                <td>
                    {job.name}
                </td>
                <td>
                    {job.permissions.map(p => `${p.email || 'ID:' + p.userId} (${p.role})`).join(', ')}
                </td>
                <td>
                    {job.commonData?.Nome_scuola}
                </td>
                <td>
                    {job.commonData["Città_scuola"]}
                </td>
                <td>
                    {job.commonData["Distretto"]}
                </td>
                <td title={(job.messages || []).join(', ')}>{job.messages?.length ? `${job.messages?.length} messaggi` : ''}</td>
                </tr>)}
            </tbody>
        </table>
    </>

    async function go() {
        const jobsList = Object.values(jobs || {}).filter(job => job.selected)
        
        // Separa i job da creare da quelli da aggiornare
        const sheetsToCreate = jobsList
            .filter(job => job.action === 'crea')
            .map(job => ({
                schema: job.schema,
                workbookId,
                name: job.name,
                permissions: job.permissions.map(p => ({
                    email: p.email,
                    userId: p.userId,
                    role: p.role
                })),
                commonData: job.commonData,
            }))
        
        const sheetsToUpdate = jobsList
            .filter(job => job.action === 'aggiorna' && job.sheet?._id)
            .map(update_info_from_job)
        
        console.log('Sheets to create:', sheetsToCreate)
        console.log('Sheets to update:', sheetsToUpdate)
        
        try {
            // Crea nuovi fogli
            if (sheetsToCreate.length > 0) {
                await createSheets({
                    variables: { sheets: sheetsToCreate },
                    refetchQueries: ['GetSheets'],
                })
            }
            
            // Aggiorna fogli esistenti
            if (sheetsToUpdate.length > 0) {
                await updateSheetsMutation({
                    variables: { sheets: sheetsToUpdate },
                    refetchQueries: ['GetSheets'],
                })
            }
            
            done()
        } catch (err) {
            console.error('Error in go():', err)
        }
    }
}

type UpdateInfo = {
    _id: ObjectId,
    permissions: {
        email?: string,
        userId?: ObjectId,
        role: string
    }[],
    commonData: Data
}

function update_info_from_job(job: Job): UpdateInfo {
    return {
        _id: job.sheet!._id!,
        permissions: job.permissions.map(p => ({
            email: p.email || undefined,
            userId: p.userId || undefined,
            role: p.role
        })),
        commonData: job.commonData,
    }
}