"use client"
import { useState, useRef } from "react"
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'
import { ErrorBoundary } from 'react-error-boundary'
import { Data, Row, Scan, ScanResults, Sheet } from "@/app/lib/models"
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

function ScansLog({sheet,data_rows}:{
    sheet: Sheet,
    data_rows: Row[],
}) {
    const { data, error } = useQuery(SCANS_QUERY, { variables: { sheetId: sheet._id.toString() }, pollInterval: 3000 });

    if (error) return <ErrorElement error={error} />
    if (!data) return <Loading />

    const scans = data.scans

    return <ul className="list-disc pl-5 space-y-2">
        {scans.map(scan => <li key={scan.jobId}>
                <i>{myTimestamp(scan.timestamp)}</i> - {}
                <b className={{'completed': 'text-green-700','error': 'text-red-500'}[scan.status] || ''}>
                    {scan.message}
                </b>
                <br />
                {scan.status === "completed" && 
                    <ScanResultsTable 
                        sheet={sheet} 
                        jobId={scan.jobId} 
                        data_rows={data_rows} 
                    />
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
            raw_data,
        }
    }`

function ScanResultsTable({sheet, jobId, data_rows}:{
    sheet: Sheet, 
    jobId: string,
    data_rows: Row[],
}) {
    const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
    const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
    const [selected, setSelected] = useState<ObjectId[]>([])
    const { data, error } = useQuery(SCAN_RESULTS_QUERY, { variables: { sheetId: sheet._id.toString(), jobId } })
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
        <Button disabled={selected.length === 0 || addLoading || patchLoading} onClick={importSelected}>
            importa {selected.length} righe selezionate
        </Button>
        { (addLoading || patchLoading) && <Loading /> }
        <table>
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
                        key={row._id} sheet={sheet} jobId={jobId} row={row} 
                        selected={selected.includes(row._id)}
                        setSelected={(checked: boolean) => setSelected(lst => checked ? [...lst,row._id] : lst.filter(_ =>  !_.equals(row._id)))}
                        data={scans_to_data_dict[row._id.toString()]?.data || {}}
                    />)
                }
            </tbody>
        </table>
    </>

    async function importSelected() {
        for (let i=0; i < rows.length; i++) {
            const scan_row = rows[i]
            if (!selected.includes(scan_row._id)) break
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

function ScanRow({sheet, jobId, row, selected, setSelected, data} : {
    sheet: Sheet,
    jobId: string,
    row: ScanResultsWithId,
    selected: boolean,
    setSelected: (checked: boolean) => void,
    data: Data,
}) {
    const schema = schemas[sheet.schema]
    return <tr key={row._id}>
        <td><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/></td>
        <td className="text-center"><a href={`/sheet/${sheet._id.toString()}/scan/${jobId}/image/${row.image}`} target="_blank" rel="noopener noreferrer">👁</a></td>
        {schema.fields.map(field => 
            <td key={field.name}>
                {data[field.name]}
            </td>)}  
    </tr>
}