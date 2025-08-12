import { gql } from '@apollo/client'
import { ObjectId } from 'bson'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import Sheets from '@/app/components/Sheets'
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

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook
    return <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">{workbook?.name}</h1>
        </div>
        <Sheets workbookId={workbookId} />
    </div>
}