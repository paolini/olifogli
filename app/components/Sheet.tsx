import { useState, useEffect } from 'react'
import { gql, useQuery, useSubscription } from '@apollo/client'
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
import { getTabId } from '../lib/tabId'
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

const ROW_CHANGED_SUBSCRIPTION = gql`
  subscription OnRowChanged($sheetId: ObjectId!) {
    rowChanged(sheetId: $sheetId) {
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

const CURSOR_CHANGED_SUBSCRIPTION = gql`
  subscription OnCursorChanged($sheetId: ObjectId!) {
    cursorChanged(sheetId: $sheetId) {
      email
      lineKey
      fieldName
      tabId
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
    const { loading, error, data, subscribeToMore } = useQuery<{rows:Row[]}>(GET_ROWS, {
        variables: {sheetId: sheet._id},
    });
    const [lastCsvDownload, setLastCsvDownload] = useState<Date|undefined>(undefined);
    const [csvImport, setCsvImport] = useState<boolean>(false)
    const tabId = getTabId()
    const [otherCursors, setOtherCursors] = useState<Record<string, { email: string, lineKey: string | null, fieldName: string | null }>>({})

    useSubscription(CURSOR_CHANGED_SUBSCRIPTION, {
        variables: { sheetId: sheet._id },
        onData: ({ data }) => {
            const cursor = data.data?.cursorChanged
            console.log('[cursorChanged] onData (ownTabId=%s):', tabId, JSON.stringify(cursor))
            if (!cursor || cursor.tabId === tabId) return
            console.log('[cursorChanged] aggiorno otherCursors con', cursor.email, cursor.lineKey, cursor.fieldName)
            setOtherCursors(prev => {
                if (cursor.lineKey === null && cursor.fieldName === null) {
                    const { [cursor.tabId]: _, ...rest } = prev
                    return rest
                }
                return {
                    ...prev,
                    [cursor.tabId]: { email: cursor.email, lineKey: cursor.lineKey ?? null, fieldName: cursor.fieldName ?? null }
                }
            })
        },
        onError: (err) => {
            console.error('[cursorChanged] subscription error:', err)
        },
    })

    // Configura la sottoscrizione WebSocket
    useEffect(() => {
        const unsubscribe = subscribeToMore({
            document: ROW_CHANGED_SUBSCRIPTION,
            variables: { sheetId: sheet._id },
            updateQuery: (prev, { subscriptionData }) => {
                if (!subscriptionData.data) return prev;
                const newRow = (subscriptionData.data as unknown as { rowChanged: Row }).rowChanged;
                
                const exists = prev.rows.find(r => r._id.toString() === newRow._id.toString());
                if (exists) {
                    return {
                        ...prev,
                        rows: prev.rows.map(r => r._id.toString() === newRow._id.toString() ? newRow : r)
                    };
                } else {
                    return {
                        ...prev,
                        rows: [...prev.rows, newRow]
                    };
                }
            }
        });
        return () => unsubscribe();
    }, [subscribeToMore, sheet._id]);

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
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={false}
                adminEditMode={false}
                otherCursors={otherCursors}
                tabId={tabId}
            />
        }
        { tab === 'edit' &&
            <Table 
                edit={true} 
                sheet={sheet} 
                rows={data.rows} 
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={false}
                adminEditMode={true}
                otherCursors={otherCursors}
                tabId={tabId}
            />
        }
        { tab === 'standardAnswers' && !csvImport &&
            <Table 
                edit={false} 
                sheet={sheet} 
                rows={data.rows} 
                lastCsvDownload={lastCsvDownload}
                csvDownload={csvDownload}
                setCsvImport={setCsvImport}
                standardAnswers={true}
                adminEditMode={false}
                otherCursors={otherCursors}
                tabId={tabId}
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
