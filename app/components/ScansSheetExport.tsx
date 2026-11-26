import { gql } from "@apollo/client";
import { useSubscription } from "@apollo/client";
import { Row, ScanSheetJob, Sheet, useDeleteScanSheetJobMutation, useRequestScanSheetGenerationMutation, useScanSheetJobsQuery } from "../graphql/generated"
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
    const blank = nBlankSheets === 1 ? '1 foglio vuoto' : `${nBlankSheets} fogli vuoti`
    if (nRows === 0) return nBlankSheets === 1 ? 'Solo foglio vuoto' : `Solo ${blank}`
    const students = nRows === 1 ? '1 studente' : `${nRows} studenti`
    return nBlankSheets === 0 ? students : `${students} + ${blank}`
}

export default function ScansPdfExport({sheet, rows}:{
    sheet: Sheet
    rows: Row[]
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

    async function handleAllRows() {
        const nRows = rows.length
        const nWithoutId = rows.filter(row => !row.data?.id).length
        const question = nRows === 1
            ? 'Generare il foglio-risposta per l\'unico studente del foglio?'
            : `Generare i fogli-risposta per tutti i ${nRows} studenti del foglio?`
        const warning = nWithoutId === 0 ? ''
            : nWithoutId === 1 ? '\n\nAttenzione: uno studente non ha un ID studente valido.'
            : `\n\nAttenzione: ${nWithoutId} studenti non hanno un ID studente valido.`
        if (!window.confirm(question + warning)) return
        // senza selectedRowIds il server prende tutte le righe del foglio
        await requestGeneration({ variables: { sheetId: new ObjectId(sheet._id) } })
        await refetchJobs()
    }

    async function handleBlankSheet() {
        // nessuna riga: il PDF contiene solo il foglio bianco che viene sempre aggiunto in fondo
        await requestGeneration({ variables: { sheetId: new ObjectId(sheet._id), selectedRowIds: [] } })
        await refetchJobs()
    }

    async function handleDelete(jobId: ObjectId) {
        if (!window.confirm('Eliminare il PDF dei fogli-risposta?')) return
        await deleteJob({ variables: { jobId } })
        await refetchJobs()
    }

    return <div>
        {canManage && <>
            <h2>Generazione fogli-risposta a lettura ottica</h2>
            <OmrWorkerStatus type="olisheet" />
            <Error error={requestError} />
            <div className="flex items-center gap-2 mt-2">
                <Button disabled={requestLoading || rows.length === 0} onClick={handleAllRows}>
                    Genera fogli-risposta
                </Button>
                <span>Per generare i fogli per tutti gli studenti</span>
            </div>
            <p className="my-2">
                Se si desidera generare i fogli-risposta solo per alcuni studenti, nella
                pagina INSERIMENTO DATI selezionare gli studenti interessati e scegliere
                la voce di menu &laquo;Genera fogli-risposta per la selezione&raquo;.
            </p>
            <div className="flex items-center gap-2">
                <Button disabled={requestLoading} onClick={handleBlankSheet}>
                    Genera foglio vuoto
                </Button>
                <span>(Per avere alcune copie di riserva)</span>
            </div>
            <div className="my-8"/>
        </>}

        <h2>Fogli-risposta generati</h2>
        {!canManage && <OmrWorkerStatus type="olisheet" />}
        {jobsLoading && <Loading />}
        <Error error={jobsError} />
        <Error error={subscriptionError} />
        <Error error={deleteError} />
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
            !jobsLoading && <p className="text-gray-500">Non è ancora stato generato nessun foglio-risposta.</p>
        )}
        <p className="mt-2">
            In fondo a ogni PDF viene sempre aggiunto un foglio vuoto da fotocopiare
            per i partecipanti non registrati.
        </p>
    </div>
}
