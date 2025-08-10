"use client"

import { gql, useQuery } from '@apollo/client'
import { useParams } from 'next/navigation'
import { ObjectId } from 'bson'

import Error from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import Sheets from '@/app/components/Sheets'
import Page from '@/app/components/Page'

const GET_WORKBOOK = gql`
    query GetWorkbook($workbookId: ObjectId!) {
        workbook(workbookId: $workbookId) {
            _id
            name
        }
    }
`

function WorkbookContent() {
    const params = useParams<{ workbookId: string }>()
    const workbookId = new ObjectId(params.workbookId)

    const { loading, error, data } = useQuery(GET_WORKBOOK, {
        variables: { workbookId },
    })

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const workbook = data?.workbook

    return <div>
        <h1 className="text-2xl font-bold">{workbook?.name}</h1>
        <Sheets workbookId={workbookId} />
    </div>
}

export default function WorkbookPage() {
    return <Page>
        <WorkbookContent />
    </Page>
}
