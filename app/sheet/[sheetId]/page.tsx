"use client"
import { useParams } from 'next/navigation'
import { ObjectId } from 'bson'

import Page from '@/app/components/Page'
import Sheet from '@/app/components/Sheet'

export default function SheetPage() {
    const params = useParams<{ sheetId: string }>()
    const sheetId = new ObjectId(params.sheetId)
    return <Page>
        <Sheet sheetId={sheetId}/>
    </Page>
}

