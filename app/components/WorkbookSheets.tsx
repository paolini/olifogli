'use client'

import { ObjectId } from 'bson'
import Sheets from '@/app/components/Sheets'

export default function WorkbookSheets({ workbookId }: { workbookId: ObjectId }) {
    return <Sheets workbookId={workbookId} />
}
