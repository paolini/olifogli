'use client'

import { useRef, useEffect } from 'react'
import { gql, useSubscription } from '@apollo/client'
import { ObjectId } from 'bson'

const WORKBOOK_UPDATED_SUBSCRIPTION = gql`
    subscription WorkbookUpdated($workbookId: ObjectId!) {
        workbookUpdated(workbookId: $workbookId)
    }
`

export function useWorkbookUpdated(workbookId: ObjectId, onUpdate: () => void, delay = 500) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onUpdateRef = useRef(onUpdate)

    useEffect(() => {
        onUpdateRef.current = onUpdate
    })

    useSubscription(WORKBOOK_UPDATED_SUBSCRIPTION, {
        variables: { workbookId },
        onData: () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => onUpdateRef.current(), delay)
        },
    })
}
