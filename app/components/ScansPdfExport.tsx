import { gql } from "graphql-request";
import { Sheet, useRequestScanSheetGenerationMutation } from "../graphql/generated"
import Button from "./Button"
import Error from "./Error"
import { ObjectId } from "bson"

const _ = gql`
    mutation requestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]!) {
        requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
    }
`;

export default function ScansPdfExport({sheet, selectedIds}:{
    sheet: Sheet
    selectedIds: Set<string>
}) {
    const [requestScanSheetGeneration, { loading, error }] = useRequestScanSheetGenerationMutation({
        refetchQueries: ['ScanJobs']
    })

    return <div>
    <h2>Esporta scansioni PDF</h2>
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
                selectedRowIds,
            }
        })
    }
}