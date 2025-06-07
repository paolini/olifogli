import { useState } from 'react'
import { gql, useQuery, TypedDocumentNode, useMutation } from '@apollo/client'
import Papa from "papaparse"
import { useRouter } from 'next/navigation'

import { Row, Sheet, User } from '@/app/lib/models'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'
import Button from './Button'
import { schemas } from '../lib/schema'
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
    if (!data || profile===undefined) return <Loading />;

    const { sheet } = data

    return <>
            <h1>{sheet.name} [{sheet.schema}]</h1>
            <SheetBody sheet={sheet} profile={profile} />
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

function SheetBody({sheet,profile}: {
    sheet:Sheet & {_id: string}
    profile:User|null
}) {
    const [tab, setTab] = useState<'table' | 'csv' | 'scans' | 'configure'>('table')
    const { loading, error, data } = useQuery<{rows:Row[]}>(GET_ROWS, {variables: {sheetId: sheet._id}});
    const schema = schemas[sheet.schema]
    const user_can_configure = profile && (profile.is_admin || sheet.owner_id === profile._id)
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    

    return <>
        { tab === 'table' && 
            <>
                <Button onClick={() => setTab('csv')}>
                    Importa da CSV
                </Button>
                {} <Button onClick={() => csv_download()}>
                    Scarica CSV
                </Button>
                {} <Button onClick={() => setTab('scans')}>
                    Importa da scansioni
                </Button>
                {} { user_can_configure && 
                <Button variant="alert" onClick={() =>setTab('configure') }>
                    configura
                </Button>}
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
        { tab === 'configure' && 
            <SheetConfigure sheet={sheet} profile={profile}/>
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

const DELETE_SHEET = gql`
    mutation DeleteSheet($_id: ObjectId!) {
        deleteSheet(_id: $_id)
    }
`;


function SheetConfigure({sheet, profile}: {
    sheet: Sheet & {_id: string}
    profile: User | null
}) {
    const router = useRouter()
    const [deleteSheet, {loading, error}] = useMutation<{deleteSheet:string}>(DELETE_SHEET)

    if (error) return <tr className="error"><td colSpan={99}>Errore: {error.message}</td></tr>;

    const permissions = sheet.permissions || [] 
    const [danger_zone_active, setDangerZoneActive] = useState(false)

    return <>
        <table>
            <thead>
                <tr>
                    <th>utente</th>
                    <th>restrizione</th>
                </tr>
            </thead>
            <tbody>
                {permissions.map((f,i) => <tr key={i} className="ml-2">
                    <td>{f?.user_email} {f?.user_id?.toString()}</td>
                    <td>
                        {f.filter_field}=<b>{f.filter_value}</b>
                    </td>
                </tr>)}
            </tbody>
        </table>
        <div style={{marginTop: '1em'}}>
            <label>
                <input type="checkbox" checked={danger_zone_active} onChange={e => setDangerZoneActive(e.target.checked)} />
                <span style={{marginLeft: '0.5em'}}>zona pericolosa</span>
            </label>
            <div>
                <Button variant="danger" disabled={loading || !danger_zone_active} onClick={() => doDelete()}>
                    Elimina questo foglio
                </Button>
            </div>
        </div>
    </>

    async function doDelete() {
        console.log("Deleting sheet", sheet._id)
        await deleteSheet({variables: {_id: sheet._id}})
        console.log("Sheet deleted, redirecting to home")
        router.push('/')
    }
    
}