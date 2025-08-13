import { useState } from 'react'
import { gql, useQuery } from '@apollo/client'
import Papa from "papaparse"
import { useRouter, useSearchParams } from 'next/navigation'
import { ObjectId } from 'bson'
import Link from 'next/link'

import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'
import Button from './Button'
import { schemas } from '../lib/schema'
import { myTimestamp } from '../lib/util'
import useProfile from '../lib/useProfile'
import {Row, Sheet, User, useGetSheetQuery} from '@/app/graphql/generated'
import SheetConfigure from './SheetConfigure'

const GET_SHEET = gql`
    query getSheet($sheetId: ObjectId!) {
        sheet(sheetId: $sheetId) {
            _id
            name
            schema
            permittedEmails
            permittedIds
            workbook {
                _id
                name
            }
            commonData
            ownerId
            nRows
        }
    }
`

export default function SheetElement({sheetId}: {
    sheetId: ObjectId
}) {
    const { data, error } = useGetSheetQuery({ variables: { sheetId } })
    const profile = useProfile()
    if (error) return <Error error={error} />;
    if (!data || profile===undefined) return <Loading />;

    const { sheet } = data
    if (!sheet || error) return <Error error={error} /> 

    return <>
        <h1>{sheet.name} [
            {sheet.schema} 
            {} {profile.isAdmin 
                ? <Link href={`/workbook/${sheet.workbook._id}`}>{sheet.workbook.name}</Link> 
                : sheet.workbook.name}
            ]
        </h1>
        <table className="my-2">
            <tbody>
                {sheet.commonData && Object.entries(sheet.commonData).map(([key, value]) => (
                    <tr key={key}>
                        <td className="bg-gray-200">{key.replace('_', ' ')}</td>
                        <td>{value as string || ''}</td>
                    </tr>))}
            </tbody>
        </table>
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
    sheet: Sheet
    profile: User|null
}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const tabParam = searchParams.get('tab');
    const validTabs = ['table', 'csv', 'scans', 'configure'] as const;
    type TabType = typeof validTabs[number];
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType);
    }
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'table';
    const [tab, setTabState] = useState<TabType>(initialTab);

    const { loading, error, data } = useQuery<{rows:Row[]}>(GET_ROWS, {variables: {sheetId: sheet._id}});
    const schema = schemas[sheet.schema]
    const user_can_configure = true // profile && (profile.isAdmin || sheet.ownerId === profile._id)
    
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
            <Button className="mr-2 my-2" onClick={() => setTab('table')}>
                Torna alla tabella
            </Button>
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
    
    // Aggiorna la query string quando cambia il tab
    function setTab(newTab: typeof validTabs[number]) {
        setTabState(newTab);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (newTab === 'table') {
            params.delete('tab');
        } else {
            params.set('tab', newTab);
        }
        router.replace('?' + params.toString(), { scroll: false });
    }

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

