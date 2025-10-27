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
            permissions {
                email
                userId
                role
            }
            workbook {
                _id
                name
                commonData
            }
            commonData
            ownerId
            nRows
            closed
            closedBy
            closedOn
            locked
            lockedBy
            lockedOn
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

    return <div className="sheet-wrapper">
        <div className="sheet-header">
            <div className="flex items-center gap-3 mb-2">
                <h1 className="flex-1">{sheet.name} [
                    {sheet.schema} 
                    {} {sheet.workbook.name}]
                </h1>
                {profile.isAdmin &&
                    <Link href={`/workbook/${sheet.workbook._id}`}>
                        <Button>← Torna alla raccolta <i>{sheet.workbook.name}</i></Button>
                    </Link>
                }
                {!profile.isAdmin &&
                    <Link href="/">
                    <Button>← Torna all&apos;elenco dei fogli</Button>
                    </Link>
                }
            </div>
        </div>
        <SheetBody sheet={sheet} profile={profile} />
    </div>
}

const GET_ROWS = gql`
  query GetRows($sheetId: ObjectId!) {
    rows(sheetId: $sheetId) {
      _id
      error
      data
      createdOn
      createdBy
      updatedOn
      updatedBy
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
    const validTabs = ['info','table', 'edit', 'csv', 'scans', 'configure'] as const;
    type TabType = typeof validTabs[number];
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType);
    }
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'info';
    const [tab, setTabState] = useState<TabType>(initialTab);

    const { loading, error, data } = useQuery<{rows:Row[]}>(GET_ROWS, {
        variables: {sheetId: sheet._id},
        pollInterval: 5000 // millisecondi
    });
    const user_can_configure = true // profile && (profile.isAdmin || sheet.ownerId === profile._id)
    const sheetContainsErrors = !!(data?.rows.filter(row => row.error!=='').length)
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    

    return <div className="sheet-body-wrapper">
        <div className="tab-container">
            <button
                className={`tab-button ${tab === 'info' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('info')}
            >
                Informazioni
            </button>
            <button 
                className={`tab-button ${tab === 'table' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('table')}
            >
                Visualizza dati
            </button>
            <button 
                className={`tab-button ${tab === 'edit' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('edit')}
            >
                Modifica dati
            </button>
            {!(sheet.closed || sheet.locked) && (
                <>
                    <button 
                        className={`tab-button ${tab === 'csv' ? 'tab-button-active' : 'tab-button-inactive'}`}
                        onClick={() => setTab('csv')}
                    >
                        Importa CSV
                    </button>
                    <button 
                        className={`tab-button ${tab === 'scans' ? 'tab-button-active' : 'tab-button-inactive'}`}
                        onClick={() => setTab('scans')}
                    >
                        Importa scansioni
                    </button>
                </>
            )}
            {user_can_configure && (
                <button 
                    className={`tab-button ${tab === 'configure' ? 'tab-button-active' : 'tab-button-inactive'}`}
                    onClick={() => setTab('configure')}
                >
                    Configura
                </button>
            )}
        </div>
        { tab === 'info' && 
            <div>
                <SheetInfo sheet={sheet} data={data} />
            </div>
        }
        { tab === 'table' && 
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Table sheet={sheet} rows={data.rows} edit={false}/>
            </div>
        }
        { tab === 'edit' && 
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Table sheet={sheet} rows={data.rows} edit={true}/>
            </div>
        }
        { tab === 'csv' &&   
            <div>
                <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setTab('table')}/>
            </div>
        }
        { tab === 'scans' && 
            <div>
                <ScansImport sheet={sheet} data_rows={data.rows} />
            </div>
        }
        { tab === 'configure' && 
            <div>
                <SheetConfigure sheet={sheet} profile={profile} sheetContainsErrors={sheetContainsErrors} />
            </div>
        }
    </div>
    
    // Aggiorna la query string quando cambia il tab
    function setTab(newTab: typeof validTabs[number]) {
        setTabState(newTab);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set('tab', newTab);
        router.replace('?' + params.toString(), { scroll: false });
    }
}

function SheetInfo({sheet,data}:{
    sheet: Sheet
    data?: {rows: Row[]}
}) {
    const rows = data?.rows
    const schema = schemas[sheet.schema]
    const n_rows_with_errors = rows?.filter(r => r.error).length

    if (rows === undefined) return <Loading />

    return <>
        <table className="my-2">
            <tbody>
                {sheet.commonData && Object.entries(sheet.commonData).map(([key, value]) => (
                    <tr key={key}>
                        <td className="bg-gray-200">{key.replace('_', ' ')}</td>
                        <td>{value as string || ''}</td>
                    </tr>))}
            </tbody>
        </table>
        <div>
              <span>{rows.length} righe</span>
              {' • '}
              <span>{n_rows_with_errors} {n_rows_with_errors === 1 ? "non valida" : "non valide"}</span>
              {/* view_rows.length < rows.length && <>{' • '}<span>({view_rows.length} visualizzate)</span></> */}
              <br />
        </div>
        
        <div className="sheet-body-controls">
            <Button onClick={() => csv_download()}>
                Scarica CSV
            </Button>
        </div>
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

