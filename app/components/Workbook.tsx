import { gql } from '@apollo/client'
import { ObjectId } from 'bson'
import { useState } from 'react'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import Sheets from '@/app/components/Sheets'
import WorkbookReport from '@/app/components/WorkbookReport'
import Button from '@/app/components/Button'
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
    const { loading, error, data, refetch } = useGetWorkbookQuery({variables: { workbookId }})
    const [activeTab, setActiveTab] = useState<'fogli' | 'report'>('fogli')

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook
    return <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">{workbook?.name}</h1>
        </div>
        
        <div className="flex gap-2 my-4 border-b">
            <Button 
                onClick={() => setActiveTab('fogli')}
                className={activeTab === 'fogli' ? 'border-b-2 border-blue-500 -mb-px' : ''}
            >
                Fogli
            </Button>
            <Button 
                onClick={() => setActiveTab('report')}
                className={activeTab === 'report' ? 'border-b-2 border-blue-500 -mb-px' : ''}
            >
                Report
            </Button>
        </div>

        {activeTab === 'fogli' && <Sheets workbookId={workbookId} />}
        {activeTab === 'report' && <WorkbookReport workbookId={workbookId} />}
    </div>
}