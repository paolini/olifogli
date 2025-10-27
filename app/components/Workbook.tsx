import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import WorkbookSheets from '@/app/components/WorkbookSheets'
import WorkbookRanking from '@/app/components/WorkbookRanking'
import WorkbookDistribution from '@/app/components/WorkbookDistribution'
import WorkbookConfigure from '@/app/components/WorkbookConfigure'
import { useGetWorkbookQuery } from '../graphql/generated'

const GET_WORKBOOK = gql`
    query GetWorkbook($workbookId: ObjectId!) {
        workbook(workbookId: $workbookId) {
            _id
            name
            ownerId
            commonData
            sheetsCount
        }
        sheets(workbookId: $workbookId) { _id }
        me {
            _id
            email
            name
            isAdmin
        }
    }
`

const DELETE_WORKBOOK = gql`
  mutation DeleteWorkbook($_id: ObjectId!) {
    deleteWorkbook(_id: $_id)
  }
`

export default function Workbook({ workbookId }: { workbookId: ObjectId }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { loading, error, data, refetch } = useGetWorkbookQuery({variables: { workbookId }})
    
    const tabParam = searchParams.get('tab')
    const validTabs = ['fogli', 'list', 'distribuzione', 'configura'] as const
    type TabType = typeof validTabs[number]
    
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType)
    }
    
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'fogli'
    const [activeTab, setActiveTabState] = useState<TabType>(initialTab)

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook
    const profile = data?.me
    const sheetsCount = data?.sheets?.length || 0
    
    // Funzione per cambiare tab e aggiornare l'URL
    function setActiveTab(newTab: TabType) {
        setActiveTabState(newTab)
        const params = new URLSearchParams(Array.from(searchParams.entries()))
        if (newTab === 'fogli') {
            params.delete('tab')
        } else {
            params.set('tab', newTab)
        }
        router.replace('?' + params.toString(), { scroll: false })
    }
    
    return <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">{workbook?.name}</h1>
        </div>
        
        <div className="tab-container">
            <button
                onClick={() => setActiveTab('fogli')}
                className={`tab-button ${activeTab === 'fogli' ? 'tab-button-active' : 'tab-button-inactive'}`}
            >
                Fogli
            </button>
            <button
                onClick={() => setActiveTab('list')}
                className={`tab-button ${activeTab === 'list' ? 'tab-button-active' : 'tab-button-inactive'}`}
            >
                Risultati
            </button>
            <button
                onClick={() => setActiveTab('distribuzione')}
                className={`tab-button ${activeTab === 'distribuzione' ? 'tab-button-active' : 'tab-button-inactive'}`}
            >
                Distribuzione Punteggi
            </button>
            <button
                onClick={() => setActiveTab('configura')}
                className={`tab-button ${activeTab === 'configura' ? 'tab-button-active' : 'tab-button-inactive'}`}
            >
                Configurazione
            </button>
        </div>

        {activeTab === 'fogli' && <WorkbookSheets workbookId={workbookId} />}
        {activeTab === 'list' && <WorkbookRanking workbookId={workbookId} />}
        {activeTab === 'distribuzione' && <WorkbookDistribution workbookId={workbookId} />}
        {activeTab === 'configura' && workbook && <WorkbookConfigure workbook={workbook} profile={profile || null} sheetsCount={sheetsCount} />}
    </div>
}