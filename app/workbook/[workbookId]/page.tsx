"use client"

import { useParams } from 'next/navigation'
import { ObjectId } from 'bson'

import Page from '@/app/components/Page'
import Workbook from '@/app/components/Workbook'

export default function WorkbookPage() {
    const params = useParams<{ workbookId: string }>()
    return <Page>
        <Workbook workbookId={new ObjectId(params.workbookId)} />
    </Page>
}
