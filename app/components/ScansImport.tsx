"use client"
import { useState } from "react";
import { useRef } from 'react';
import { gql, useQuery, TypedDocumentNode } from '@apollo/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Scan } from "@/app/lib/models";
import Button from "./Button";
import Error from "./Error";
import Loading from "./Loading";

export default function ScansImport({sheetId}:{sheetId: string}) {
    const [file, setFile] = useState<File|null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string|null>(null);

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
                    <Button>Choose File</Button>
                </label>
                {file && <p className="text-sm">Selected: {file.name}</p>}
                <Button onClick={handleUpload} disabled={!file}>Upload</Button>
            </div>    
        </ErrorBoundary>
    </div>

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (!event.target.files) return;
        setFile(event.target.files[0]);
    };

    async function handleUpload() {
        if (!file) return;
        
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
            jobId
            status
        }
    }
`;

function ScansLog({sheetId}:{sheetId: string}) {
    const { data, error } = useQuery(SCANS_QUERY, { variables: { sheetId }, pollInterval: 1000 });

    if (error) return <Error error={error} />
    if (!data) return <Loading />

    const scans = data.scans;

    return <div>
        {scans.map(scan => <div key={scan.jobId}>{scan.jobId} {scan.status}</div>)}
    </div>
}