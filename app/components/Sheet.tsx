import { useRef, useState } from 'react'
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'

import { Row, Sheet } from '@/app/lib/models'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'

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
    const tableRef = useRef<{csv_download: ()=>{}}>(null)
    const [tab, setTab] = useState<'table' | 'csv' | 'scans'>('table')

    return <>
        { tab === 'table' && <>
            <button className="p-1 my-1 bg-alert" onClick={() => setTab('csv')}>Importa da CSV</button>
            <button className="p-1 m-1 bg-alert" onClick={() => tableRef.current?.csv_download()}>Scarica CSV</button>
            <button className="p-1 my-1 bg-alert" onClick={() => setTab('scans')}>Importa da scansioni</button>
            <br />
            <Table ref={tableRef} sheetId={sheet._id} schemaName={sheet.schema} />
            </>}
        { tab !== 'table' && 
            <button className="p-1 bg-alert" onClick={() => setTab('table')}>Torna alla tabella</button>
        }
        { tab === 'csv' &&   
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setTab('table')}/>
        }
        { tab === 'scans' && 
            <ScansImport sheetId={sheet._id} />
        }
    </>
}
