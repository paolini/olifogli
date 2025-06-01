"use client"
import { useState, useRef } from "react"
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'
import { ErrorBoundary } from 'react-error-boundary'
import { Scan, ScanResults, Sheet } from "@/app/lib/models"
import Button from "./Button"
import ErrorElement from "./Error"
import Loading from "./Loading"
import { useApolloClient } from '@apollo/client'
import { myTimestamp } from "../lib/util"
import { schemas } from "../lib/schema"
import { ObjectId } from "bson"

export default function ScansImport({sheet}:{sheet: Sheet}) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [error, setError] = useState<string|null>(null)
    const [busy, setBusy] = useState(false)
    const client = useApolloClient()

    function handleClick() {
      fileInputRef.current?.click()
    }

    return <>
        <h2>Caricamento scansioni OCR</h2>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <div className="flex flex-col gap-4">
                { error && <ErrorElement error={error} dismiss={()=>setError('')}/> }
                <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" id="scansFileInput" />
                <label htmlFor="scansFileInput" onClick={handleClick} className="cursor-pointer">
                    <Button disabled={busy}>carica PDF</Button>
                </label>
            </div>    
            <ScansLog sheet={sheet} />
        </ErrorBoundary>
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
  

const SCANS_QUERY: TypedDocumentNode<{scans: Scan[]}, {sheetId: string}>  = gql`
    query Scans($sheetId: ObjectId!) {
        scans(sheetId: $sheetId) {
            timestamp
            sheetId
            jobId
            status
            message
        }
    }`

function ScansLog({sheet}:{sheet: Sheet}) {
    const { data, error } = useQuery(SCANS_QUERY, { variables: { sheetId: sheet._id.toString() }, pollInterval: 3000 });

    if (error) return <ErrorElement error={error} />
    if (!data) return <Loading />

    const scans = data.scans;

    return <ul className="list-disc pl-5 space-y-2">
        {scans.map(scan => <li key={scan.jobId}>
                <i>{myTimestamp(scan.timestamp)}</i> - {}
                <b className={{'completed': 'text-green-700','error': 'text-red-500'}[scan.status] || ''}>
                    {scan.message}
                </b>
                <br />
                {scan.status === "completed" && 
                    <ScanResultsTable sheet={sheet} jobId={scan.jobId} />
                }
            </li>)}
    </ul>
}

type ScanResultsWithId = ScanResults & {_id: string};

const SCAN_RESULTS_QUERY: TypedDocumentNode<{scanResults: ScanResultsWithId[]}, {sheetId: string, jobId: string}> = gql`
    query ScanResults($sheetId: ObjectId, $jobId: String!) {
        scanResults(sheetId: $sheetId, jobId: $jobId) {
            _id,
            sheetId,
            jobId,
            image,
            data_raw,
        }
    }`

function ScanResultsTable({sheet, jobId}:{sheet: Sheet, jobId: string}) {
    const [selected, setSelected] = useState<ObjectId[]>([])
    const { data, error } = useQuery(SCAN_RESULTS_QUERY, { variables: { sheetId: sheet._id.toString(), jobId } })
    if (error) return <ErrorElement error={error} />
    if (!data) return <Loading />
    const rows = data.scanResults
    const schema = schemas[sheet.schema]

    if (rows.length === 0) return <p>Nessun dato acquisito</p>;
    
    return <>
        <Button disabled={selected.length === 0}>
            importa righe selezionate
        </Button>
        <table>
            <thead>
                <tr>
                    <th><input type="checkbox" 
                            checked={selected.length === rows.length}
                            onChange={e => setSelected(lst => e.target.checked ? rows.map(row => row._id) : [])}
                        />
                    </th>
                    <th>scan</th>
                    { schema.scan_fields.map(field => 
                        <th key={field.name}>
                            {field.header}
                        </th>
                    )}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => 
                    <ScanRow key={row._id} sheet={sheet} jobId={jobId} row={row} 
                        selected={selected.includes(row._id)}
                        setSelected={(checked: boolean) => setSelected(lst => checked ? [...lst,row._id] : lst.filter(_ => _ !== row._id))}
                    />)
                }
            </tbody>
        </table>
    </>

}

function ScanRow({sheet, jobId, row, selected, setSelected}:{
    sheet: Sheet,
    jobId: string,
    row: ScanResultsWithId,
    selected: boolean,
    setSelected: (checked: boolean) => void,
}) {
    const schema = schemas[sheet.schema]
    const data = schema.scan_to_data(row)
    return <tr key={row._id}>
        <td><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/></td>
        <td className="text-center"><a href={`/sheet/${sheet._id.toString()}/scan/${jobId}/image/${row.image}`} target="_blank" rel="noopener noreferrer">👁</a></td>
        {schema.scan_fields.map(field => 
            <td key={field.name}>
                {data[field.name]}
            </td>)}  
    </tr>
}