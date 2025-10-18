import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import WorkbookSheets from '@/app/components/WorkbookSheets'
import WorkbookRanking from '@/app/components/WorkbookRanking'
import WorkbookDistribution from '@/app/components/WorkbookDistribution'
import { useGetWorkbookQuery } from '../graphql/generated'

const GET_WORKBOOK = gql`
    query GetWorkbook($workbookId: ObjectId!) {
        workbook(workbookId: $workbookId) {
            _id
            name
        }
        sheets(workbookId: $workbookId) { _id }
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
    const validTabs = ['fogli', 'list', 'distribuzione'] as const
    type TabType = typeof validTabs[number]
    
    function isTabType(tab: string | null): tab is TabType {
        return validTabs.includes(tab as TabType)
    }
    
    const initialTab: TabType = isTabType(tabParam) ? tabParam : 'fogli'
    const [activeTab, setActiveTabState] = useState<TabType>(initialTab)

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook
    
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
        
        <div className="flex gap-0 my-4 border-b border-gray-300">
            <button
                onClick={() => setActiveTab('fogli')}
                className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'fogli' 
                        ? 'bg-white border-l border-t border-r border-gray-300 border-b-white -mb-px rounded-t text-blue-600' 
                        : 'bg-gray-100 text-gray-600 hover:text-gray-800 border-b border-gray-300'
                }`}
            >
                Fogli
            </button>
            <button
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'list' 
                        ? 'bg-white border-l border-t border-r border-gray-300 border-b-white -mb-px rounded-t text-blue-600' 
                        : 'bg-gray-100 text-gray-600 hover:text-gray-800 border-b border-gray-300'
                }`}
            >
                Risultati
            </button>
            <button
                onClick={() => setActiveTab('distribuzione')}
                className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'distribuzione' 
                        ? 'bg-white border-l border-t border-r border-gray-300 border-b-white -mb-px rounded-t text-blue-600' 
                        : 'bg-gray-100 text-gray-600 hover:text-gray-800 border-b border-gray-300'
                }`}
            >
                Distribuzione Punteggi
            </button>
        </div>

        {activeTab === 'fogli' && <WorkbookSheets workbookId={workbookId} />}
        {activeTab === 'list' && <WorkbookRanking workbookId={workbookId} />}
        {activeTab === 'distribuzione' && <WorkbookDistribution workbookId={workbookId} />}
    </div>
}