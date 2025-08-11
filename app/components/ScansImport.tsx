"use client"
import { useState, useRef, Dispatch, SetStateAction } from "react"
import { gql, useQuery, TypedDocumentNode, useMutation } from '@apollo/client'
import { Data, Row, ScanJob, ScanMessage, ScanResults, Sheet } from "@/app/lib/models"
import Button from "./Button"
import ErrorElement from "./Error"
import Loading from "./Loading"
import { useApolloClient } from '@apollo/client'
import { myTimestamp } from "../lib/util"
import { schemas } from "../lib/schema"
import { ObjectId } from "bson"
import { useAddRow, usePatchRow } from "./TableInner"

export default function ScansImport({sheet, data_rows}:{
    sheet: Sheet,
    data_rows: Row[] 
}) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [error, setError] = useState<string|null>(null)
    const [busy, setBusy] = useState(false)
    const client = useApolloClient()

    function handleClick() {
      fileInputRef.current?.click()
    }

    return <>
        <h2>Caricamento scansioni OCR</h2>
        <div className="flex flex-col gap-4">
            { error && <ErrorElement error={error} dismiss={()=>setError('')}/> }
            <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" id="scansFileInput" />
            <label htmlFor="scansFileInput" onClick={handleClick} className="cursor-pointer">
                <Button disabled={busy}>carica PDF</Button>
            </label>
        </div>    
        <ScansLog sheet={sheet} data_rows={data_rows}/>
        {/*
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <div className="flex flex-col gap-4">
                { error && <ErrorElement error={error} dismiss={()=>setError('')}/> }
                <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" id="scansFileInput" />
                <label htmlFor="scansFileInput" onClick={handleClick} className="cursor-pointer">
                    <Button disabled={busy}>carica PDF</Button>
                </label>
            </div>    
            <ScansLog sheet={sheet} data_rows={data_rows}/>
        </ErrorBoundary>
        */}
    </>

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        console.log('handleFileChange', event.target.files)
        if (!event.target.files) return
        const file = event.target.files[0]
        setBusy(true)
        event.target.value = ''
        await handleUpload(file)
        setBusy(false)
        client.refetchQueries({ include: [SCANS_QUERY] })
    }

    async function handleUpload(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sheetId', sheet._id.toString());
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const data = await response.json()
            setError(data?.error || "upload failed")
        }
    }
}


function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
    return <ErrorElement error={error} dismiss={resetErrorBoundary}/>
  }
  
interface ScanJobWithMessage extends ScanJob {
    message: ScanMessage
}

const SCANS_QUERY: TypedDocumentNode<{scanJobs: ScanJobWithMessage[]}, {sheetId: string}>  = gql`
    query Scans($sheetId: ObjectId!) {
        scanJobs(sheetId: $sheetId) {
            _id
            timestamp
            sheetId
            message {
                status
                message
                timestamp
            }
        }
    }`

function ScansLog({sheet,data_rows}:{
    sheet: Sheet,
    data_rows: Row[],
}) {
    const { data, error } = useQuery(SCANS_QUERY, { variables: { sheetId: sheet._id.toString() }, pollInterval: 3000 });

    if (error) return <ErrorElement error={error} />
    if (!data) return <Loading />

    const jobs = data.scanJobs

    return <ul className="list-disc pl-5 space-y-2">
        {jobs.map(job => <li key={job._id.toString()} className="pt-8">
                <ScansJob sheet={sheet} data_rows={data_rows} job={job}/>
            </li>)}
    </ul>
}

const SCANS_DELETE_MUTATION = gql`
  mutation DeleteScan($jobId: ObjectId!) {
    deleteScan(jobId: $jobId)
  }
`

function ScansJob({sheet, data_rows, job}: {
    sheet: Sheet
    data_rows: Row[]
    job: ScanJobWithMessage
}) {
    const [deleteChecked, setDeleteChecked] = useState(false)
    const [deleteScan, { loading: deleteLoading, error: deleteError, reset: deleteReset }] 
        = useMutation(SCANS_DELETE_MUTATION, {refetchQueries: [{query: SCANS_QUERY}]})
    const [raw,setRaw] = useState(false)
    const message = job.message
    const done = message.status === 'completed' || message.status === 'error' || message.timestamp < new Date(Date.now() - 60 * 1000) // more than 1 minute old   

    return <>
        {message && <>
            <i>{myTimestamp(message.timestamp)}</i> - {}
            <b className={{'completed': 'text-green-700','error': 'text-red-500'}[message.status] || ''}>
                {message.message}
            </b> {}
            </>
        }
        { done && 
            <label style={{marginLeft: '1em', marginRight: '1em'}}>
                <input type="checkbox" checked={raw} onChange={e => setRaw(e.target.checked)} /> dati grezzi
            </label>
        }   
        {done &&
            // delete checkbox and button
            <span className="ml-4">
                <label className="bg-error p-2 rounded">
                    <input type="checkbox" checked={deleteChecked} onChange={e => setDeleteChecked(e.target.checked)} />
                    <span style={{marginLeft: '0.5em'}}>elimina</span>
                </label>
                {deleteChecked && <Button variant="danger" style={{marginLeft: '1em'}} disabled={!deleteChecked || deleteLoading} onClick={handleDelete}>
                    {deleteLoading ? 'Eliminazione...' : 'conferma eliminazione'}
                </Button> }
                {deleteError && <ErrorElement error={deleteError} dismiss={deleteReset}/>}
            </span>
        }   
        <br />
        { done && 
            <ScanResultsTable 
                sheet={sheet}
                job={job} 
                data_rows={data_rows} 
                showRaw={raw}
            />
        }
    </>

    async function handleDelete() {
        await deleteScan({ variables: { jobId: job._id } })
        setDeleteChecked(false)
    }
}

type ScanResultsWithId = ScanResults & {_id: string};

const SCAN_RESULTS_QUERY: TypedDocumentNode<{scanResults: ScanResultsWithId[]}, {jobId: ObjectId}> = gql`
    query ScanResults($jobId: ObjectId!) {
        scanResults(jobId: $jobId) {
            _id,
            sheetId,
            jobId,
            image,
            rawData,
        }
    }`

function ScanResultsTable({sheet, job, data_rows, showRaw}:{
    sheet: Sheet,
    job: ScanJob,
    data_rows: Row[],
    showRaw: boolean
}) {
    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
    const [selected, setSelected] = useState<ObjectId[]>([])
    const { data, error } = useQuery(SCAN_RESULTS_QUERY, { variables: { jobId: job._id } })
    if (error) return <ErrorElement error={error} />
    if (addError) return <ErrorElement error={addError} dismiss={addReset} />
    if (patchError) return <ErrorElement error={patchError} dismiss={patchReset} />
    if (!data) return <Loading />
    const rows = data.scanResults
    const schema = schemas[sheet.schema]
    const scans_to_data_dict = schema.scans_to_data_dict(rows, data_rows)

    if (rows.length === 0) return <p>Nessun dato acquisito</p>
    
    return <>
        <span><b>{rows.length}</b> righe </span>
        <Button disabled={showRaw || selected.length === 0 || addLoading || patchLoading} onClick={importSelected}>
            importa {selected.length} righe selezionate
        </Button> {}
        { (addLoading || patchLoading) && <Loading /> }
        {showRaw 
            ? <RawResultsTable job={job} rows={rows}/>
            : <MergedResultTable job={job} selected={selected} setSelected={setSelected} rows={rows} schema={schema} scans_to_data_dict={scans_to_data_dict}/>
        }
    </>

    async function importSelected() {
        for (let i=0; i < rows.length; i++) {
            const scan_row = rows[i]
            if (!selected.includes(scan_row._id)) continue
            const {row, data} = scans_to_data_dict[scan_row._id.toString()] || {row: undefined, data: {}}
            if (row) {
                const res = await patchRow({
                    variables: {
                        _id: row._id,
                        data,
                        updatedOn: row.updatedOn || new Date(),
                    }})
                if (res.errors) continue
            } else {
                const res = await addRow({variables:{
                        sheetId: sheet._id,
                        data,
                    }
                })
                if (res.errors) break
            }
            setSelected(lst => lst.filter(id => `${id}`!= `${scan_row._id}`))
        }
    }
}

function MergedResultTable({job, selected, setSelected, rows, schema, scans_to_data_dict}: {
    job: ScanJob,
    selected: ObjectId[],
    setSelected: Dispatch<SetStateAction<ObjectId[]>>,
    rows: ScanResultsWithId[],
    scans_to_data_dict: Partial<Record<string, {row: Row | undefined;data: Data;}>>
    schema: typeof schemas[string]
}) {
    return <table>
        <thead>
            <tr>
                <th><input type="checkbox" 
                        checked={selected.length === rows.length}
                        onChange={e => setSelected(lst => e.target.checked ? rows.map(row => row._id) : [])}
                    />
                </th>
                <th>scan</th>
                { schema.fields.map(field => 
                    <th key={field.name}>
                        {field.header}
                    </th>
                )}
            </tr>
        </thead>
        <tbody>
            {rows.map(row => 
                <ScanRow 
                    key={row._id} job={job} row={row} 
                    selected={selected.includes(row._id)}
                    setSelected={(checked: boolean) => setSelected(lst => checked ? [...lst,row._id] : lst.filter(_ =>  `${_}` != `${row._id}`))}
                    data={scans_to_data_dict[row._id.toString()]?.data || {}}
                    schema={schema}
                />)
            }
        </tbody>
    </table>
}

function RawResultsTable({job, rows}: {
    job: ScanJob,
    rows: ScanResultsWithId[],
}) {
    const fields = rows.length > 0 ? Object.keys(rows[0].rawData || {}) : []
    return <table>
        <thead>
            <tr>
                <th>scan</th>
                { fields.map(field => 
                    <th key={field}>
                        {field}
                    </th>
                )}
            </tr>
        </thead>
        <tbody>
            {rows.map(row => 
                <tr key={row._id}>
                    <td className="text-center"><a href={`/scan/${job._id.toString()}/image/${row.image}`} target="_blank" rel="noopener noreferrer">👁</a></td>
                    {fields.map(field => 
                        <td key={field}>
                            {row.rawData[field] || ''}
                        </td>)}
                </tr>
            )}
        </tbody>
    </table>
}


function ScanRow({job, row, selected, setSelected, data, schema} : {
    job: ScanJob,
    row: ScanResultsWithId,
    selected: boolean,
    setSelected: (checked: boolean) => void,
    data: Data,
    schema: typeof schemas[string]
}) {
    return <tr key={row._id}>
        <td><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/></td>
        <td className="text-center"><a href={`/scan/${job._id.toString()}/image/${row.image}`} target="_blank" rel="noopener noreferrer">👁</a></td>
        {schema.fields.map(field => 
            <td key={field.name}>
                {data[field.name]}
            </td>)}  
    </tr>
}