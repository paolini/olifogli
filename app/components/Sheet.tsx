import { useRef, useState } from 'react'
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'

import { Row, Sheet } from '@/app/lib/models'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'
import Button from './Button'

const GET_SHEET: TypedDocumentNode<{sheet: Sheet & {_id: string}}> = gql`
    query getSheet($sheetId: ObjectId!) {
        sheet(sheetId: $sheetId) {
            _id
            name
            schema
        }
    }
`

export default function SheetElement({sheetId}: {
    sheetId: string
}) {
    const { data, error } = useQuery(GET_SHEET, { variables: { sheetId } });
    if (error) return <Error error={error} />;
    if (!data) return <Loading />;

    const { sheet } = data

    return <>
            <h1>{sheet.name} [{sheet.schema}]</h1>
            <SheetBody sheet={sheet} />
        </>
}

function SheetBody({sheet}: {sheet:Sheet & {_id: string}}) {
    const tableRef = useRef<{csv_download: ()=>void}>(null)
    const [tab, setTab] = useState<'table' | 'csv' | 'scans'>('table')
    const [busy, setBusy] = useState(false)

    return <>
        { tab === 'table' && 
            <>
                <Button onClick={() => setTab('csv')}>Importa da CSV</Button>
                {} <Button onClick={() => tableRef.current?.csv_download()}>Scarica CSV</Button>
                {} <Button onClick={() => setTab('scans')}>Importa da scansioni</Button>
                <br />
                <Table ref={tableRef} sheetId={sheet._id} schemaName={sheet.schema} />
            </>
        }
        { tab !== 'table' && 
            <Button disabled={busy} onClick={() => setTab('table')}>Torna alla tabella</Button>
        }
        { tab === 'csv' &&   
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setTab('table')}/>
        }
        { tab === 'scans' && 
            <ScansImport sheet={sheet} />
        }
    </>
}
