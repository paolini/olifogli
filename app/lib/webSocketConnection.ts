import { createClient, type Client } from 'graphql-ws'
import { getTabId } from './tabId'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'unavailable'
let state: ConnectionState = 'idle'
let client: Client | undefined
let generation = 0
let connectionTimer: ReturnType<typeof setTimeout> | undefined
let pongTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function update(next: ConnectionState) {
    if (state === next) return
    state = next
    for (const listener of listeners) listener()
}

function clearTimers() {
    clearTimeout(connectionTimer)
    clearTimeout(pongTimer)
}

export function subscribeWebSocketState(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export const getWebSocketState = () => state
export const getServerWebSocketState = (): ConnectionState => 'idle'

// Shared by the login health check and Apollo subscriptions: one socket per tab.
export function getWebSocketClient(): Client {
    if (client) return client
    const current = ++generation
    const active = () => generation === current
    update('connecting')
    client = createClient({
        url: window.location.hostname === 'localhost'
            ? 'ws://localhost:4001/graphql'
            : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/graphql`,
        connectionParams: () => ({ tabId: getTabId() }),
        lazy: false,
        connectionAckWaitTimeout: 5000,
        keepAlive: 15000,
        retryAttempts: Infinity,
        retryWait: () => new Promise(resolve => setTimeout(resolve, 3000)),
        onNonLazyError: () => { if (active()) update('unavailable') },
        on: {
            connecting: () => {
                if (!active()) return
                clearTimers()
                // Keep an existing warning visible throughout retries.
                if (state !== 'unavailable') update('connecting')
                connectionTimer = setTimeout(() => {
                    if (active()) update('unavailable')
                }, 5000)
            },
            connected: () => {
                if (!active()) return
                clearTimers()
                update('connected')
            },
            closed: () => {
                if (!active()) return
                clearTimers()
                update('unavailable')
            },
            error: () => { if (active()) update('unavailable') },
            ping: received => {
                if (received || !active()) return
                clearTimeout(pongTimer)
                pongTimer = setTimeout(() => {
                    if (!active()) return
                    update('unavailable')
                    client?.terminate()
                }, 5000)
            },
            pong: received => {
                if (received && active()) clearTimeout(pongTimer)
            },
        },
    })
    return client
}

export function stopWebSocketClient() {
    ++generation
    clearTimers()
    const previous = client
    client = undefined
    update('idle')
    void previous?.dispose()
}
