import { gql } from "graphql-request";
import { Sheet, useRequestScanSheetGenerationMutation, useScanSheetJobsQuery } from "../graphql/generated"
import Button from "./Button"
import Error from "./Error"
import { ObjectId } from "bson"
import Loading from "./Loading"

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
            ownerId
            timestamp
            messages {
                status
                message
                timestamp
            }
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

    return <div>
    <h2>PDF fogli generati</h2>
    
    {jobsLoading && <Loading />}
    <Error error={jobsError} />
    {jobsData?.scanSheetJobs && jobsData.scanSheetJobs.length > 0 ? (
        <table className="border-collapse border border-gray-300 w-auto">
            <thead>
                <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">File</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Data</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Stato</th>
                </tr>
            </thead>
            <tbody>
                {jobsData.scanSheetJobs.map(job => {
                    const lastMessage = job.messages[job.messages.length - 1]
                    return (
                        <tr key={job._id.toString()}>
                            <td className="border border-gray-300 px-4 py-2">{lastMessage?.message || 'N/A'}</td>
                            <td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
                                {new Date(job.timestamp).toLocaleString('it-IT')}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                                <span className={`px-2 py-1 rounded text-sm ${
                                    lastMessage?.status === 'completed' 
                                        ? 'bg-green-100 text-green-800' 
                                        : lastMessage?.status === 'pending'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-gray-100 text-gray-800'
                                }`}>
                                    {lastMessage?.status || 'unknown'}
                                </span>
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    ) : (
        !jobsLoading && <p className="text-gray-500">Non hai generato nessun foglio PDF.</p>
    )}
        {
        selectedIds.size > 0 ? (
            <p>Hai selezionato {selectedIds.size} righe per l'esportazione.</p>
        ) : (
            <p>Verranno esportate tutte le righe del foglio.</p>
        )
    }
    <Error error={error} />
    <Button onClick={submit} disabled={loading}>Esporta PDF</Button>
    {error && <p>Errore: {error.message}</p>}
    </div>

    function submit() {
        const selectedRowIds = Array.from(selectedIds).map(id => new ObjectId(id))
        requestScanSheetGeneration({
            variables: {
                sheetId: new ObjectId(sheet._id),
                selectedRowIds: selectedRowIds.length>0 ? selectedRowIds : undefined,
            }
        })
    }
}