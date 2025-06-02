import { useState } from 'react'
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'
import Papa from "papaparse"

import { Row, Sheet } from '@/app/lib/models'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'
import Button from './Button'
import { AvailableSchemas, schemas } from '../lib/schema'
import { myTimestamp } from '../lib/util'
import useProfile from '../lib/useProfile'

const GET_SHEET: TypedDocumentNode<{sheet: Sheet & {_id: string}}> = gql`
    query getSheet($sheetId: ObjectId!) {
        sheet(sheetId: $sheetId) {
            _id
            name
            schema
            permissions {
                user_id
                user_email
                filter_field
                filter_value
            }
        }
    }
`

export default function SheetElement({sheetId}: {
    sheetId: string
}) {
    const { data, error } = useQuery(GET_SHEET, { variables: { sheetId } })
    const profile = useProfile()
    if (error) return <Error error={error} />;
    if (!data) return <Loading />;

    const { sheet } = data

    // Mostra i filtri attivi se presenti
    const permissions = sheet.permissions || []

    return <>
            <h1>{sheet.name} [{sheet.schema}]</h1>
            {permissions.length > 0 && (
                <div className="mb-2 text-sm text-gray-700">
                    {permissions.map((f,i) => <span key={i} className="ml-2">
                        {f.user_email && f.user_email!=profile?.email ? <span>{f.user_email}:</span> : ""} 
                        {f.user_id && f.user_id!=profile?._id ? <span>{f.user_id.toString()}:</span> : ""} 
                        {f.filter_field} = <b>{f.filter_value}</b></span>)}
                </div>
            )}
            <SheetBody sheet={sheet} />
        </>
}

const GET_ROWS = gql`
  query getRows($sheetId: ObjectId!) {
    rows(sheetId: $sheetId) {
      _id
      isValid
      data
      updatedOn
    }
  }
`

function SheetBody({sheet}: {sheet:Sheet & {_id: string}}) {
    const [tab, setTab] = useState<'table' | 'csv' | 'scans'>('table')
    const { loading, error, data } = useQuery<{rows:Row[]}>(GET_ROWS, {variables: {sheetId: sheet._id}});
    const schema = schemas[sheet.schema as AvailableSchemas]
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    

    return <>
        { tab === 'table' && 
            <>
                <Button onClick={() => setTab('csv')}>Importa da CSV</Button>
                {} <Button onClick={() => csv_download()}>Scarica CSV</Button>
                {} <Button onClick={() => setTab('scans')}>Importa da scansioni</Button>
                <br />
                <Table sheet={sheet} rows={data.rows} />
            </>
        }
        { tab !== 'table' && 
            <Button onClick={() => setTab('table')}>Torna alla tabella</Button>
        }
        { tab === 'csv' &&   
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setTab('table')}/>
        }
        { tab === 'scans' && 
            <ScansImport sheet={sheet} data_rows={data.rows} />
        }
    </>

    async function csv_download() {
        if (!data) return
        const filename = myTimestamp(new Date()).replace(':', '-').replace(' ', '_') + '.csv'

        downloadCSVWithPapa(
            schema.csv_header(),
            data.rows.map(row => schema.csv_row(row.data)),
            filename
        )
    }
}

function downloadCSVWithPapa(fields: string[], rows: string[][], filename = "dati.csv") {
const csv = Papa.unparse({
    fields: fields,
    data: rows
}); // converte array di oggetti o array di array

const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);

const link = document.createElement("a");
link.setAttribute("href", url);
link.setAttribute("download", filename);
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
}

