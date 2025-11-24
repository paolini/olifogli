import { useState, useEffect } from 'react'
import { gql, useQuery } from '@apollo/client'
import Papa from "papaparse"
import { useRouter, useSearchParams } from 'next/navigation'
import { ObjectId } from 'bson'

import Error from './Error'
import Loading from './Loading'
import Button from './Button'
import Table from './Table'
import CsvImport from './CsvImport'
import ScansImport from './ScansImport'
import { schemas } from '../lib/schema'
import { myTimestamp } from '../lib/util'
import useProfile from '../lib/useProfile'
import {Row, Sheet, User, useGetSheetQuery} from '@/app/graphql/generated'
import { useBreadcrumbs } from './BreadcrumbsProvider'
import SheetInfo from './SheetInfo'
import ScansSheetExport from './ScansSheetExport'
import GlobalMessage from './GlobalMessage'

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
            nValidRows
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
                { label: `${sheet.name} ‒ ${schema?.header_essential}` }
            ])
        }
        return () => setBreadcrumbs([])
    }, [data?.sheet, setBreadcrumbs])
    
    if (error) return <Error error={error} />;
    if (!data || profile===undefined) return <Loading />;

    const { sheet } = data
    if (!sheet || error) return <Error error={error} /> 

    return <div className="sheet-wrapper">
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
        olimanager {
        participantId
        resultsUpdatedOn
        error
        }
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
    const validTabs = ['info','table', 'csv', 'scans', 'download'] as const;
    type TabType = typeof validTabs[number];
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType);
    }
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'info';
    const [tab, setTabState] = useState<TabType>(initialTab);
    const canEdit: boolean = profile && sheet.permissions?.some(p => p.email === profile.email && (p.role === 'editor' || p.role === 'admin')) || false;
    const [polling, setPolling ] = useState<boolean>(!(tab === 'table' && canEdit));
    const { loading, error, data, refetch, stopPolling, startPolling } = useQuery<{rows:Row[]}>(GET_ROWS, {
        variables: {sheetId: sheet._id},
        pollInterval: (polling || tab === 'info') ? 5000 : 0
    });
    const [lastCsvDownload, setLastCsvDownload] = useState<Date|undefined>(undefined);
    const [csvImport, setCsvImport] = useState<boolean>(false)

    const refresh = async () => {
        await refetch()
    }
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    
    const schema = schemas[sheet.schema]

    return <div className="sheet-body-wrapper">
        <div className="tab-container hide-print">
            <button
                className={`tab-button ${tab === 'info' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('info')}
            >
                PANNELLO
            </button>
            { <button 
                className={`tab-button ${tab === 'table' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('table')}
            >
                {canEdit && !sheet.closed && !sheet.locked
                ? "INSERIMENTO DATI"
                : "VISUALIZZAZIONE DATI"}
            </button>}
            { /*
            <button 
                className={`tab-button ${tab === 'csv' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('csv')}>
                IMPORTA CSV
            </button>
            */}
            <button 
                className={`tab-button ${tab === 'scans' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('scans')}>
                IMPORTA SCANSIONI
            </button>
            {/*
            <button 
                className={`tab-button ${tab === 'download' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('download')}>
                SCARICA CSV
            </button>*/}
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        { tab === 'info' && 
        <div className="mx-2">
            <SheetInfo sheet={sheet} data={data} profile={profile} />
        </div>
        }
        { tab === 'table' && !csvImport &&
            <Table 
                edit={canEdit} 
                sheet={sheet} 
                rows={data.rows} 
                refresh={refresh} 
                refreshLoading={loading}
                polling={polling}
                setPolling={setPolling}
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
            />
        }
        { tab === 'table' && csvImport &&
            /* ((sheet.closed || sheet.locked) 
                ? <>
                    <Error error="Il foglio è chiuso. Non è possibile importare dati." />
                    <Button onClick={() => setCsvImport(false)}>
                        Annulla importazione
                    </Button>
                </>
                : */
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setCsvImport(false)}/>
        }
        { tab === 'scans' && <div className="mx-2">
            <GlobalMessage name="scan_info" title="instructions" collapsed={true} />
            <ScansSheetExport sheet={sheet} />
            <div className="my-8"/>
            <ScansImport sheet={sheet} data_rows={data.rows} />
          </div>
        }
        { tab === 'download' && 
            <div>
                <Button onClick={() => csvDownload()}>
                    Scarica CSV
                </Button>
            </div>
        }
        </div>
    </div>
    
    // Aggiorna la query string quando cambia il tab
    function setTab(newTab: typeof validTabs[number]) {
        setTabState(newTab);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set('tab', newTab);
        router.replace('?' + params.toString(), { scroll: false });
    }

    async function csvDownload(rows?: Row[]) {
        if (!rows) rows = data?.rows
        if (!rows) return
        const filename = `${sheet.name}_${schema.name.replace(' ', '_')}_${myTimestamp(new Date()).replace(':', '-').replace(' ', '_')}.csv`

        await downloadCSVWithPapa(
            schema.csv_header(),
            rows.map(row => schema.csv_row(row.data)),
            filename
        )
        setLastCsvDownload(new Date())
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

