"use client"
import { useState } from "react";
import { useRef } from 'react';
import { gql, useQuery, TypedDocumentNode } from '@apollo/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Scan, ScanResults } from "@/app/lib/models";
import Button from "./Button";
import Error from "./Error";
import Loading from "./Loading";
import { useApolloClient } from '@apollo/client';

export default function ScansImport({sheetId}:{sheetId: string}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string|null>(null);
    const [busy, setBusy] = useState(false);
    const client = useApolloClient();

    function handleClick() {
      fileInputRef.current?.click();
    };

    return <div className="p-4 border rounded-lg shadow-md">
        Caricamento scansioni OCR {}
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <ScansLog sheetId={sheetId} />
            <div className="flex flex-col items-center gap-4">
                { error && <Error error={error} /> }
                <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" id="scansFileInput" />
                <label htmlFor="scansFileInput" onClick={handleClick} className="cursor-pointer">
                    <Button disabled={busy}>Choose File</Button>
                </label>
            </div>    
        </ErrorBoundary>
    </div>

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (!event.target.files) return;
        const file = event.target.files[0];
        setBusy(true);
        await handleUpload(file)
        setBusy(false);
        client.refetchQueries({
            include: [SCANS_QUERY],
        });
    };

    async function handleUpload(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sheetId', sheetId.toString());
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
        } else {
            const data = await response.json();
            setError(data?.error || "upload failed");
        }
    };
}


function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
    return (
      <div>
        <h2>Errore!</h2>
        <p>{error.message}</p>
        <button onClick={resetErrorBoundary}>Riprova</button>
      </div>
    );
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
    }
`;

function ScansLog({sheetId}:{sheetId: string}) {
    const { data, error } = useQuery(SCANS_QUERY, { variables: { sheetId }, pollInterval: 3000 });

    if (error) return <Error error={error} />
    if (!data) return <Loading />

    const scans = data.scans;

    return <div>
        {scans.map(scan => <div key={scan.jobId}>
            [job {scan.jobId}] {scan.message}
            {scan.status === "completed" && <ScanResultsTable sheetId={sheetId} jobId={scan.jobId} />}
        </div>)}
    </div>
}

type ScanResultsWithId = ScanResults & {_id: string};

const SCAN_RESULTS_QUERY: TypedDocumentNode<{scanResults: ScanResultsWithId[]}, {sheetId: string, jobId: string}> = gql`
    query ScanResults($sheetId: ObjectId, $jobId: String!) {
        scanResults(sheetId: $sheetId, jobId: $jobId) {
            _id,
            sheetId,
            jobId,
            image,
            data,
        }
    }
`;

function ScanResultsTable({sheetId, jobId}:{sheetId: string, jobId: string}) {
    const { data, error } = useQuery(SCAN_RESULTS_QUERY, { variables: { sheetId, jobId } });
    if (error) return <Error error={error} />
    if (!data) return <Loading />
    const rows = data.scanResults;

    if (rows.length === 0) return <p>Nessun dato acquisito</p>;
    
    const headers = Object.keys(rows[0].data);
    return <>
        <table>
            <thead>
                <tr>
                    <th>Image</th>
                    {headers.map(header => <th key={header}>{header}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => <tr key={row._id}>
                    <td><a href={`/sheet/${sheetId}/scan/${jobId}/image/${row.image}`} target="_blank" rel="noopener noreferrer">👁</a></td>
                    {headers.map(header => <td key={header}>{row.data[header]}</td>)}
                </tr>)}
            </tbody>
        </table>
    </>
}