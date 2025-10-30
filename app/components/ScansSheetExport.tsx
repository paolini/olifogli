import { gql } from "graphql-request";
import { Sheet, useRequestScanSheetGenerationMutation, useScanSheetJobsQuery } from "../graphql/generated"
import Button from "./Button"
import Error from "./Error"
import { ObjectId } from "bson"
import Loading from "./Loading"
import { myTimestamp } from "../lib/util";
import { useEffect, useRef, useState } from "react";

const _ = gql`
    mutation requestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]) {
        requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
    }
`;

const __ = gql`
    query scanSheetJobs($sheetId: ObjectId!) {
        scanSheetJobs(sheetId: $sheetId) {
            _id
            sheetId
            createdBy
            timestamp
            status
            message
        }
    }
`;

export default function ScansPdfExport({sheet, selectedIds}:{
    sheet: Sheet
    selectedIds: Set<string>
}) {
    const [requestScanSheetGeneration, { loading, error }] = useRequestScanSheetGenerationMutation({
        refetchQueries: ['ScanSheetJobs']
    })

    const { data: jobsData, loading: jobsLoading, error: jobsError } = useScanSheetJobsQuery({
        variables: { sheetId: new ObjectId(sheet._id) },
        pollInterval: 5000, // Poll every 5 seconds to update job status
    })

    // Keep the button disabled for 10 seconds after clicking
    const [cooldown, setCooldown] = useState(false)
    const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
        }
    }, [])

    return <div>
        <h2>PDF fogli generati</h2>
        
        {jobsLoading && <Loading />}
        <Error error={jobsError} />
        {jobsData?.scanSheetJobs && jobsData.scanSheetJobs.length > 0 ? (
            <table className="border-collapse border border-gray-300 w-auto">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">Data</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Stato</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">File</th>
                    </tr>
                </thead>
                <tbody>
                    {jobsData.scanSheetJobs.map(job => {
                        return (
                            <tr key={job._id.toString()}>
                                <td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
                                    {myTimestamp(job.timestamp)}
                                </td>
                                <td className="border border-gray-300 px-4 py-2">
                                    <span className={`px-2 py-1 rounded text-sm ${
                                        job.status === 'completed' 
                                            ? 'bg-green-100 text-green-800' 
                                            : job.status === 'pending'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {job.status || 'unknown'}
                                    </span>
                                </td>
                                <td className="border border-gray-300 px-4 py-2">
                                    { job.status === 'completed' 
                                        ?    <a 
                                                href={`/scansheet/${job._id}/pdf`}
                                                className="text-blue-600 hover:text-blue-800 underline"
                                                download
                                            >
                                                Scarica PDF
                                            </a>
                                        : (job.message || '???')
                                    }
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        ) : (
            !jobsLoading && <p className="text-gray-500">Non hai generato nessun foglio PDF.</p>
        )}
        <div>
            <Error error={error} />
            <Button className="mr-4 my-4" onClick={submit} disabled={loading || cooldown}>
                Avvia creazione fogli risposte
            </Button>
                {selectedIds.size > 0 
                    ? <span>Hai selezionato {selectedIds.size} righe per l&apos;esportazione.</span>
                    : <span>Verranno esportate tutte le righe del foglio.</span>
                }
        </div>
    </div>

    function submit() {
        // Start 10s cooldown on click
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
        setCooldown(true)
        cooldownTimer.current = setTimeout(() => setCooldown(false), 10_000)

        const selectedRowIds = Array.from(selectedIds).map(id => new ObjectId(id))
        requestScanSheetGeneration({
            variables: {
                sheetId: new ObjectId(sheet._id),
                selectedRowIds: selectedRowIds.length>0 ? selectedRowIds : undefined,
            }
        })
    }
}