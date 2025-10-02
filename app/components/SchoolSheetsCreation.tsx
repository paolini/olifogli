import { ObjectId } from 'bson'
import { useEffect, useState } from 'react'
import { useGetSheetsQuery, useGetRowsQuery, Row, Sheet, useAddSheetsMutation, Permission } from '../graphql/generated'
import Error from './Error'
import Button from './Button'
import { Data } from '../lib/models'
import Loading from './Loading'
import { gql } from '@apollo/client'

type Job = {
    rowId: ObjectId|null,
    sheet: Partial<Sheet>|null,
    name: string,
    permissions: Permission[],
    commonData: Data,
    message?: string,
    selected?: boolean
}

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
            <Process jobsCallback={jobs} workbookId={workbookId} sheetId={sheetId} />
        }
    </div>

    async function jobs() {
        if (!rows || !sheets) throw "error"
        const jobs: Record<string,Job> = {}

        function addJob(job: Job) {
            const existing = jobs[job.name]
            if (!existing) {
                jobs[job.name] = {
                    ...job,
                    message: 'crea',
                    selected: job.permissions.length > 0
                }
            } else {
                if (existing.message === 'crea') {
                    existing.rowId = job.rowId
                    // Merge permissions avoiding duplicates
                    const mergedPermissions = [...existing.permissions]
                    for (const newPerm of job.permissions) {
                        const exists = mergedPermissions.some(p => 
                            (p.email && newPerm.email && p.email === newPerm.email) ||
                            (p.userId && newPerm.userId && p.userId.equals(newPerm.userId))
                        )
                        if (!exists) {
                            mergedPermissions.push(newPerm)
                        }
                    }
                    existing.permissions = mergedPermissions
                    existing.commonData = {
                        ...existing.commonData, 
                        ...job.commonData}
                    existing.message = 'aggiorna'
                } else {
                    existing.message = 'duplicato'
                    existing.selected = false
                }
            }
        }

        for (const sheet of sheets) {
            if (sheet.schema !=='archimede') continue
            addJob({
                sheet,
                rowId: null,
                name: sheet.name || '',
                permissions: sheet.permissions || [],
                commonData: {...sheet.commonData}
            })
        }

        for (const row of rows || []) {
            const name = row.data?.Codice_meccanografico || ''
            const email = row.data?.Email_referente || ''
            addJob({
                rowId: row._id,
                name,
                permissions: email ? [{ email, role: 'editor' }] : [],
                sheet: null,
                commonData: {
                    Nome_scuola: row.data?.Nome_scuola || '',
                    "Città_scuola": row.data["Città_scuola"] || ''
                }
            })
        }
        return jobs
    }
}

export const ADD_SHEETS = gql`
  mutation AddSheets($sheets: [SheetInput!]!) {
    addSheets(sheets: $sheets)
  }
`

function Process({jobsCallback, workbookId, sheetId}: {
    jobsCallback: () => Promise<Record<string,Job>>,
    workbookId: ObjectId
    sheetId: ObjectId
}) {
    const [createSheets, {loading, error}] = useAddSheetsMutation()
    const [jobs, setJobs] = useState<null|Record<string,Job>>(null)
    
    useEffect(() => {
        jobsCallback().then(setJobs)
    }, [jobsCallback])

    if (jobs === null) return <Loading />
    return <>
        <Button className="mx-2" disabled={loading} onClick={go} >
            procedi
        </Button>
        {} crea {Object.values(jobs).filter(job => job.selected && job.message === 'crea').length} fogli
        {} aggiorna {Object.values(jobs).filter(job => job.selected && job.message === 'aggiorna').length} fogli
        <Error error={error}/>
        <table>
            <thead>
                <tr>
                    <th></th>
                    <th>codice</th>
                    <th>referenti</th>
                    <th>scuola</th>
                    <th>città</th></tr>
            </thead>
            <tbody>
                {Object.values(jobs).map(job => <tr key={job.name}>
                <td>
                    <input 
                        type="checkbox" 
                        checked={job.selected} 
                        onChange={() => {
                            setJobs(jobs => ({
                                ...jobs,
                                [job.name]: {
                                    ...job,
                                    selected: !job.selected
                                }
                            }))
                        }}
                        />
                    {} {job.message}
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
                </tr>)}
            </tbody>
        </table>
    </>

    function go() {
        createSheets({variables: {
            sheets: Object.values(jobs || {}).filter(job => job.selected && job.message === 'crea')
                .map(job => ({
                    schema: "archimede",
                    workbookId,
                    name: job.name,
                    permissions: job.permissions,
                    commonData: job.commonData,
                }))
        }})
    }
}

