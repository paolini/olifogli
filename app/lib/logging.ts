// Never log Error.message, stack, cause, or arbitrary error metadata: these may
// contain credentials, personal values, response bodies or database queries.
const SAFE_ERROR_CODES = new Set([
    'UNAUTHENTICATED', 'FORBIDDEN', 'BAD_USER_INPUT', 'GRAPHQL_PARSE_FAILED',
    'GRAPHQL_VALIDATION_FAILED', 'INTERNAL_SERVER_ERROR', 'ECONNREFUSED',
    'SIGNIN_OAUTH_ERROR', 'OAUTH_CALLBACK_ERROR', 'JWT_SESSION_ERROR', 'SESSION_ERROR',
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EACCES', 'ENOENT', 'ENOSPC',
])

export function safeErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
        const value = error as { code?: unknown; extensions?: { code?: unknown } }
        const code = value.extensions?.code ?? value.code
        if (typeof code === 'string' && SAFE_ERROR_CODES.has(code)) return code
    }
    return 'INTERNAL_SERVER_ERROR'
}

// event must be a static identifier at the call site, never supplied by a user.
export function logDiagnostic(event: string, error?: unknown, level: 'error' | 'warn' = 'error'): void {
    console[level](JSON.stringify({ timestamp: new Date().toISOString(), event, code: safeErrorCode(error) }))
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
