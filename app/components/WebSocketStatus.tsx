'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import {
    getWebSocketClient, stopWebSocketClient, subscribeWebSocketState,
    getWebSocketState, getServerWebSocketState,
} from '../lib/webSocketConnection'

export default function WebSocketStatus() {
    const { status } = useSession()
    const connection = useSyncExternalStore(subscribeWebSocketState, getWebSocketState, getServerWebSocketState)

    useEffect(() => {
        if (status === 'authenticated') getWebSocketClient()
        else if (status === 'unauthenticated') stopWebSocketClient()
    }, [status])

    if (status !== 'authenticated' || connection !== 'unavailable') return null
    const local = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    return <div role="alert" className="border border-amber-500 bg-amber-50 p-3 text-amber-950 hide-print">
        <p>Connessione agli aggiornamenti in tempo reale non disponibile. I dati visualizzati potrebbero non essere aggiornati.</p>
        {local && <p>Avvia il server WebSocket in un altro terminale: <code>npm run ws-server:watch</code>.</p>}
        <p>Se il servizio è disponibile, la riconnessione avviene automaticamente. Se il problema persiste, ricarica la pagina o accedi di nuovo.</p>
    </div>
}
