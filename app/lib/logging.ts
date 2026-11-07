// Never log Error.message, stack, cause, or arbitrary error metadata: these may
// contain credentials, personal values, response bodies or database queries.
const SAFE_ERROR_CODES = new Set([
    'UNAUTHENTICATED', 'FORBIDDEN', 'BAD_USER_INPUT', 'GRAPHQL_PARSE_FAILED',
    'GRAPHQL_VALIDATION_FAILED', 'INTERNAL_SERVER_ERROR', 'ECONNREFUSED',
    'SIGNIN_OAUTH_ERROR', 'OAUTH_CALLBACK_ERROR', 'JWT_SESSION_ERROR', 'SESSION_ERROR',
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EACCES', 'ENOENT', 'ENOSPC',
    'WEBSOCKET_CONNECTION_ERROR',
])

export function safeErrorCode(error: unknown, depth = 0): string {
    if (error && typeof error === 'object') {
        const value = error as { code?: unknown; extensions?: { code?: unknown }; networkError?: unknown; protocolErrors?: unknown[]; graphQLErrors?: unknown[] }
        const code = value.extensions?.code ?? value.code
        if (typeof code === 'string' && SAFE_ERROR_CODES.has(code)) return code
        // Apollo wraps transport and GraphQL errors differently across subscription APIs.
        if (depth < 3) {
            const nested = [value.networkError, ...(Array.isArray(value.protocolErrors) ? value.protocolErrors : []), ...(Array.isArray(value.graphQLErrors) ? value.graphQLErrors : [])]
            for (const item of nested) {
                if (!item) continue
                const nestedCode = safeErrorCode(item, depth + 1)
                if (nestedCode !== 'INTERNAL_SERVER_ERROR') return nestedCode
            }
        }
    }
    return 'INTERNAL_SERVER_ERROR'
}

// event must be a static identifier at the call site, never supplied by a user.
export function logDiagnostic(event: string, error?: unknown, level: 'error' | 'warn' = 'error'): void {
    const code = safeErrorCode(error)
    if (code === 'WEBSOCKET_CONNECTION_ERROR') {
        console.warn(JSON.stringify({ timestamp: new Date().toISOString(), event, code,
            message: 'Connessione WebSocket non disponibile: gli aggiornamenti in tempo reale sono interrotti. In locale, verifica che il server sia avviato con npm run ws-server:watch.',
        }))
        return
    }
    console[level](JSON.stringify({ timestamp: new Date().toISOString(), event, code }))
}

export function logWebSocketEvent(
    event: 'connected' | 'disconnected' | 'subscribed' | 'next' | 'error' | 'complete' | 'rejected',
    errors: readonly unknown[] = [],
): void {
    const line = JSON.stringify({
        timestamp: new Date().toISOString(), event: `ws.${event}`,
        errorCount: errors.length, errorCodes: [...new Set(errors.map(safeErrorCode))],
    })
    if (errors.length) console.error(line)
    else console.log(line)
}

// OAuth diagnostics accept only operational metadata, never tokens or response bodies.
type OlimanagerMetadata = {
    hasSession?: boolean
    hasAccessToken?: boolean
    hasApiScope?: boolean | null
    expiresInSeconds?: number | null
    accessTokenExpired?: boolean | null
    graphqlOrigin?: string | null
    providerOrigin?: string | null
    sameOrigin?: boolean | null
    status?: number
    redirected?: boolean
}

export function logOlimanagerEvent(
    event: 'oauth_login' | 'graphql_auth' | 'graphql_response',
    metadata: OlimanagerMetadata,
): void {
    const boolean = (value: unknown) => typeof value === 'boolean' ? value : null
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
    const origin = (value: unknown) => {
        if (typeof value !== 'string') return null
        try {
            const url = new URL(value)
            return ['http:', 'https:'].includes(url.protocol) ? url.origin : null
        } catch { return null }
    }
    let fields: Record<string, unknown>
    switch (event) {
        case 'oauth_login':
            fields = { hasApiScope: boolean(metadata.hasApiScope), expiresInSeconds: number(metadata.expiresInSeconds) }
            break
        case 'graphql_auth':
            fields = {
                hasSession: boolean(metadata.hasSession), hasAccessToken: boolean(metadata.hasAccessToken),
                hasApiScope: boolean(metadata.hasApiScope), expiresInSeconds: number(metadata.expiresInSeconds),
                accessTokenExpired: boolean(metadata.accessTokenExpired), graphqlOrigin: origin(metadata.graphqlOrigin),
                providerOrigin: origin(metadata.providerOrigin), sameOrigin: boolean(metadata.sameOrigin),
            }
            break
        case 'graphql_response':
            fields = { status: number(metadata.status), redirected: boolean(metadata.redirected) }
            break
        default: return
    }
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: `olimanager.${event}`, ...fields }))
}
