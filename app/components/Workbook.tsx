import { gql, useQuery, useMutation } from '@apollo/client'
import { ObjectId } from 'bson'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import Sheets from '@/app/components/Sheets'
import Button from '@/app/components/Button'
import useProfile from '@/app/lib/useProfile'
import { useRouter } from 'next/navigation'

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
    const profile = useProfile()
    const { loading, error, data } = useQuery(GET_WORKBOOK, {
        variables: { workbookId },
    })

    const [del, { loading: deleting, error: delError, reset }] = useMutation(DELETE_WORKBOOK, {
      refetchQueries: ['GetWorkbooks']
    })

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook
    const sheets = data?.sheets ?? []

    return <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold flex-1">{workbook?.name}</h1>
          {profile?.isAdmin && 
            <Button variant="danger" disabled={sheets.length > 0 || deleting} onClick={onDelete}>Elimina blocco</Button>
          }
        </div>
        <Error error={delError} dismiss={reset} />
        <Sheets workbookId={workbookId} />
    </div>

    async function onDelete() {
      await del({ variables: { _id: workbookId } })
      router.back()
    }
}