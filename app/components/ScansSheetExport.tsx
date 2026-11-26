import { gql } from "@apollo/client";
import { useSubscription } from "@apollo/client";
import { ScanSheetJob, Sheet, useDeleteScanSheetJobMutation, useRequestScanSheetGenerationMutation, useScanSheetJobsQuery } from "../graphql/generated"
import Error from "./Error"
import { ObjectId } from "bson"
import Loading from "./Loading"
import OmrWorkerStatus from "./OmrWorkerStatus"
import Button from "./Button"
import { myTimestamp } from "../lib/util";
import useProfile from "../lib/useProfile";

const _ = gql`
    query scanSheetJobs($sheetId: ObjectId!) {
        scanSheetJobs(sheetId: $sheetId) {
            _id
            sheetId
            createdBy
            timestamp
            status
            message
            nRows
            nBlankSheets
        }
    }
`;

const __ = gql`
    mutation deleteScanSheetJob($jobId: ObjectId!) {
        deleteScanSheetJob(jobId: $jobId)
    }
`;

const SCAN_SHEET_JOB_UPDATED_SUBSCRIPTION = gql`
    subscription OnScanSheetJobUpdated($sheetId: ObjectId!) {
        scanSheetJobUpdated(sheetId: $sheetId)
    }
`;

function jobContent(job: Pick<ScanSheetJob, 'nRows' | 'nBlankSheets'>) {
    const { nRows, nBlankSheets } = job
    if (nRows == null || nBlankSheets == null) return '—'
    const blank = nBlankSheets === 1 ? '1 foglio bianco' : `${nBlankSheets} fogli bianchi`
    if (nRows === 0) return nBlankSheets === 1 ? 'Solo foglio bianco' : `Solo ${blank}`
    const students = nRows === 1 ? '1 studente' : `${nRows} studenti`
    return nBlankSheets === 0 ? students : `${students} + ${blank}`
}

export default function ScansPdfExport({sheet}:{
    sheet: Sheet
}) {
    const { data: jobsData, loading: jobsLoading, error: jobsError, refetch: refetchJobs } = useScanSheetJobsQuery({
        variables: { sheetId: new ObjectId(sheet._id) },
        fetchPolicy: 'cache-and-network',
    })
    const { error: subscriptionError } = useSubscription(SCAN_SHEET_JOB_UPDATED_SUBSCRIPTION, {
        variables: { sheetId: new ObjectId(sheet._id) },
        onData: () => { refetchJobs() },
    });
    const profile = useProfile()
    const canManage = !!profile && (profile.isAdmin
        || sheet.permissions.some(p => p.email && p.email === profile.email && p.role === 'manager'))
    const [deleteJob, { loading: deleteLoading, error: deleteError }] = useDeleteScanSheetJobMutation()
    const [requestGeneration, { loading: requestLoading, error: requestError }] = useRequestScanSheetGenerationMutation()

    async function handleBlankSheet() {
        // nessuna riga: il PDF contiene solo il foglio bianco che viene sempre aggiunto in fondo
        await requestGeneration({ variables: { sheetId: new ObjectId(sheet._id), selectedRowIds: [] } })
        await refetchJobs()
    }

    async function handleDelete(jobId: ObjectId) {
        if (!window.confirm('Eliminare il PDF dei fogli risposte?')) return
        await deleteJob({ variables: { jobId } })
        await refetchJobs()
    }

    return <div>
        <h2>PDF fogli generati</h2>
        <OmrWorkerStatus type="olisheet" />
        
        {jobsLoading && <Loading />}
        <Error error={jobsError} />
        <Error error={subscriptionError} />
        <Error error={deleteError} />
        <Error error={requestError} />
        {jobsData?.scanSheetJobs && jobsData.scanSheetJobs.length > 0 ? (
            <table className="border-collapse border border-gray-300 w-auto">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left">Data</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Contenuto</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Stato</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">File</th>
                        {canManage && <th className="border border-gray-300 px-4 py-2"></th>}
                    </tr>
                </thead>
                <tbody>
                    {jobsData.scanSheetJobs.map(job => {
                        return (
                            <tr key={job._id.toString()}>
                                <td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
                                    {myTimestamp(job.timestamp)}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 whitespace-nowrap">
                                    {jobContent(job)}
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
                                {canManage && <td className="border border-gray-300 px-4 py-2">
                                    {job.status !== 'processing' &&
                                        <Button variant="danger" disabled={deleteLoading} onClick={() => handleDelete(job._id)}>
                                            elimina
                                        </Button>}
                                </td>}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        ) : (
            !jobsLoading && <p className="text-gray-500">Non hai generato nessun foglio PDF.</p>
        )}
        <div>
            Per generare i fogli risposte in PDF, seleziona le righe desiderate nel foglio e attiva 
            il pulsante &quot;Genera fogli-risposta a lettura ottica&quot;.
            In fondo al PDF viene sempre aggiunto un foglio bianco da fotocopiare
            per i partecipanti non registrati.
        </div>
        {canManage && <div className="mt-2">
            <Button disabled={requestLoading} onClick={handleBlankSheet}>
                Genera foglio bianco
            </Button>
        </div>}
    </div>
}
