import { useState, useEffect } from 'react'
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
import ArchimedeCommon from '../lib/schema/ArchimedeCommon'
import ReactMarkdown from 'react-markdown'
import { useBreadcrumbs } from '@/app/components/BreadcrumbsProvider'

const _ = gql`
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
    const { setBreadcrumbs } = useBreadcrumbs()
    
    // Imposta i breadcrumbs
    useEffect(() => {
        if (data?.sheet) {
            const sheet = data.sheet
            const schema = schemas[sheet.schema]
            setBreadcrumbs([
                { label: sheet.workbook.name || '?', href: `/workbook/${sheet.workbook._id}` },
                { label: `${sheet.name} ‒ ${schema.header_essential}` }
            ])
        }
        return () => setBreadcrumbs([])
    }, [data?.sheet, setBreadcrumbs])
    
    if (error) return <Error error={error} />;
    if (!data || profile===undefined) return <Loading />;

    const { sheet } = data
    if (!sheet || error) return <Error error={error} /> 
    const schema = schemas[sheet.schema]

    return <div className="sheet-wrapper">
        <div className="sheet-header">
            <div className="flex items-center gap-3 mb-2">
                <h1 className="flex-1">
                    {`${sheet.workbook.name || '?'} ‒ ${sheet.name} ‒ ${schema.header_essential}`}
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
    const validTabs = ['info','table', 'edit', 'csv', 'scans', 'download'] as const;
    type TabType = typeof validTabs[number];
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType);
    }
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'info';
    const [tab, setTabState] = useState<TabType>(initialTab);
    const { loading, error, data } = useQuery<{rows:Row[]}>(GET_ROWS, {
        variables: {sheetId: sheet._id},
        pollInterval: tab==='edit' ? undefined : 5000
    });
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    
    const schema = schemas[sheet.schema]

    return <div className="sheet-body-wrapper">
        <div className="tab-container">
            <button
                className={`tab-button ${tab === 'info' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('info')}
            >
                PANNELLO
            </button>
            <button 
                className={`tab-button ${tab === 'edit' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('edit')}
            >
                INSERIMENTO DATI
            </button>
            <button 
                disabled={sheet.closed || sheet.locked || false}
                className={`tab-button ${tab === 'csv' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('csv')}>
                IMPORTA CSV
            </button>
            <button 
                disabled={sheet.closed || sheet.locked || false}
                className={`tab-button ${tab === 'scans' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('scans')}>
                IMPORTA SCANSIONI
            </button>
            <button 
                className={`tab-button ${tab === 'download' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('download')}>
                SCARICA CSV
            </button>

        </div>
        { tab === 'info' && 
            <div>
                <SheetInfo sheet={sheet} data={data} profile={profile} />
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
        { tab === 'download' && 
            <div>
                <Button onClick={() => csv_download()}>
                    Scarica CSV
                </Button>
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

function SheetInfo({sheet,data,profile}:{
    sheet: Sheet
    data?: {rows: Row[]}
    profile: User | null
}) {
    const rows = data?.rows
    const n_valid_rows = rows?.filter(r => !r.error).length
    const schema = schemas[sheet.schema]
    
    if (rows === undefined) return <Loading />
    const sheetContainsErrors = !!(data?.rows.filter(row => row.error!=='').length)

    return <>
        <SheetInfoPanel sheet={sheet} profile={profile} />
        <div>
              <span>{rows.length} {rows.length === 1 ? "riga" : "righe"}</span>
              {' • '}
              <span>{n_valid_rows} {n_valid_rows === 1 ? "valida" : "valide"}</span>
              {/* view_rows.length < rows.length && <>{' • '}<span>({view_rows.length} visualizzate)</span></> */}
              <br />
        </div>
        
        <SheetConfigure sheet={sheet} profile={profile} sheetContainsErrors={sheetContainsErrors} />
    </>
}

function SheetInfoPanel({sheet,profile}:{
    sheet: Sheet
    profile: User | null
}) {
    const schema = schemas[sheet.schema]

    if (schema instanceof ArchimedeCommon) {
        return <>
            <table className="my-2 commondata">
                <tbody>
                    <tr><th>Scuola</th>
                        <td>{sheet.commonData["Nome_scuola"]}</td></tr>
                    <tr><th>Città</th>
                        <td>{sheet.commonData["Città_scuola"]}</td></tr>
                    <tr><th>Distretto</th>
                        <td>{sheet.commonData["Distretto"]?.replace("Distretto di ","")}</td></tr>
                </tbody>
            </table>
            {sheet.commonData["info"] && 
                <div className="border border-gray-600 rounded-lg my-4 p-4 max-w-2xl bg-gray-50 shadow-md">
                    <ReactMarkdown>{sheet.commonData["info"]}</ReactMarkdown>
                </div>
            }
        </>
    } else {
        return <>
            <table className="my-2 commondata">
                <tbody>
                    {Object.entries(sheet.commonData || {}).map(([key, value]) => (
                        <tr key={key}>
                            <th>{key}</th>
                            <td>{value as string || ''}</td>
                        </tr>))
                    }
                </tbody>
            </table>
        </>
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

