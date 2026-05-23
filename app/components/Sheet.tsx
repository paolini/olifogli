import { useState, useEffect } from 'react'
import { gql, useQuery } from '@apollo/client'
import Papa from "papaparse"
import { useRouter, useSearchParams } from 'next/navigation'
import { ObjectId } from 'bson'

import Error from './Error'
import Loading from './Loading'
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
import GaraPrime from '../lib/schema/GaraPrime'
import SheetSelectionImport from './SheetSelectionImport'

const _ = gql`
    query getSheet($sheetId: ObjectId!) {
        sheet(sheetId: $sheetId) {
            _id
            name
            schema
            permissions {
                email
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
            anomalies
            nSyncedRows
            nScanJobs
            nScanSheetJobs
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
      anomalies
      data
      createdOn
      createdBy
      updatedOn
      updatedBy
      olimanager {
        participantId
        contestId
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
    const validTabs = ['info','table', 'standardAnswers', 'scans', 'edit', 'selection'] as const;
    type TabType = typeof validTabs[number];
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType);
    }
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'info';
    const [tab, setTabState] = useState<TabType>(initialTab);
    const canEdit: boolean = profile && sheet.permissions?.some(p => p.email === profile.email && (p.role === 'editor' || p.role === 'admin')) || false;
    const { loading, error, data, refetch } = useQuery<{rows:Row[]}>(GET_ROWS, {
        variables: {sheetId: sheet._id},
        pollInterval: 0
    });

    // SSE: subscribe to server-sent events when polling is enabled
    useEffect(() => {
        console.log('[Sheet] Setting up SSE connection for real-time updates')
        let es: EventSource | null = null
        try {
            es = new EventSource('/api/events')
            try { console.log('[Sheet] Setting up SSE connection for real-time updates') } catch (e) {}
        } catch (e) {
            try { console.error('[Sheet] Failed to create EventSource', e) } catch (e) {}
        }
        if (es) {
        es.onopen = () => { try { console.log('[SSE client] connection opened') } catch (e) {} }
        const handleEvent = (ev: MessageEvent) => {
            try {
                const d = JSON.parse(ev.data)
                const channel: string | undefined = d?.channel
                const payload = d?.payload
                // client-side debug log for SSE messages
                try { console.log('[SSE client] message', { raw: ev.data, channel, payload }) } catch (e) {}
                if (!channel) return
                // If the event is about rows for this sheet, refetch
                if (channel === `sheet:${sheet._id}:rows` || (payload && `${payload.sheetId}` === `${sheet._id}`)) {
                    try { console.log('[SSE client] triggering refetch for sheet', `${sheet._id}`) } catch (e) {}
                    refetch()
                }
                // also handle scanJob counts/updates if needed
                if (channel?.startsWith('scanJob:') && payload?.sheetId && `${payload.sheetId}` === `${sheet._id}`) {
                    refetch()
                }
            } catch (e) {
                // ignore parse errors
            }
        }
        // listen for named events (server sends `event: rows.updated`)
        es.addEventListener('rows.updated', handleEvent as EventListener)
        // fallback for unnamed/default message events
        es.onmessage = handleEvent
        es.onerror = (err) => { try { console.error('[SSE client] error', err) } catch (e) {} ; es.close() }
        }
        return () => { if (es) es.close() }
        }, [sheet._id, refetch])
    const [lastCsvDownload, setLastCsvDownload] = useState<Date|undefined>(undefined);
    const [csvImport, setCsvImport] = useState<boolean>(false)

    const refresh = async () => {
        await refetch()
    }
    
    if (error) return <Error error={error}/>
    if (loading || !data) return <Loading />
    
    const schema = schemas[sheet.schema]
    const selectionWorkbookId = (schema instanceof GaraPrime) && sheet.workbook.commonData["selection_workbook_id"] || ''

    return <div className="sheet-body-wrapper">
        <div className="tab-container hide-print">
            <button
                className={`tab-button ${tab === 'info' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('info')}
            >
                PANNELLO
            </button>
            <button
                className={`tab-button ${tab === 'table' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('table')}
            >
                {canEdit && !sheet.closed && !sheet.locked
                ? "INSERIMENTO DATI"
                : "VISUALIZZAZIONE DATI"}
            </button>
            { sheet.nValidRows>0 && <button 
                className={`tab-button ${tab === 'standardAnswers' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('standardAnswers')}
            >
                RISPOSTE DEPERMUTATE
            </button>}
            { profile?.isAdmin && !(canEdit && !sheet.closed && !sheet.locked) && <button
                className={`tab-button ${tab === 'edit' ? 'tab-button-active' : 'tab-button-inactive'}`}
                onClick={() => setTab('edit')}
            >
                ⚙ MODIFICA DATI
            </button> }
            { selectionWorkbookId && 
                <button 
                    className={`tab-button ${tab === 'selection' ? 'tab-button-active' : 'tab-button-inactive'}`}
                    onClick={() => setTab('selection')}>
                    SELEZIONA SEGNALATI
                </button>
            }
            { schema.has_scan_functionality() &&
                <button 
                    className={`tab-button ${tab === 'scans' ? 'tab-button-active' : 'tab-button-inactive'}`}
                    onClick={() => setTab('scans')}>
                    IMPORTA SCANSIONI
                </button>
            }
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
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={false}
                adminEditMode={false}
            />
        }
        { tab === 'edit' &&
            <Table 
                edit={true} 
                sheet={sheet} 
                rows={data.rows} 
                refresh={refresh} 
                refreshLoading={loading}
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={false}
                adminEditMode={true}
            />
        }
        { tab === 'standardAnswers' && !csvImport &&
            <Table 
                edit={false} 
                sheet={sheet} 
                rows={data.rows} 
                refresh={refresh} 
                refreshLoading={loading}
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={true}
                adminEditMode={false}
            />
        }
        { (tab === 'table' || tab === 'edit') && csvImport &&
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} done={() => setCsvImport(false)}/>
        }
        { tab === 'scans' && <div className="mx-2">
            <GlobalMessage name={`scan_info_${sheet.schema}`} title="istruzioni" collapsed={true} />
            <ScansSheetExport sheet={sheet} />
            <div className="my-8"/>
            <ScansImport sheet={sheet} data_rows={data.rows} />
          </div>
        }
        { tab === 'selection' && selectionWorkbookId && <div className="mx-2">
            <GlobalMessage name={`import_selection_info_${sheet.schema}`} title="istruzioni" collapsed={true} />
            <SheetSelectionImport sheet={sheet} data_rows={data.rows} selectionWorkbookId={selectionWorkbookId}/>
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

    async function csvDownload(rows?: Row[], standardAnswers: boolean = false) {
        if (!rows) rows = data?.rows
        if (!rows) return
        const filename = `${sheet.name}_${schema.name.replace(' ', '_')}_${myTimestamp(new Date()).replace(':', '-').replace(' ', '_')}.csv`

        await downloadCSVWithPapa(
            schema.csv_header(),
            rows.map(row => schema.csv_row(row.data, standardAnswers)),
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

