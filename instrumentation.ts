export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { serverLog, logDiagnostic } = await import('./app/lib/logging')
    const { checkSessionSecret } = await import('./app/lib/sessionSecret')
    try {
      checkSessionSecret()
    } catch (error) {
      // Next.js would keep serving after a failed instrumentation hook: stop here.
      logDiagnostic('next.invalid_session_secret', error)
      process.exit(1)
    }
    const { publishAppLogsToRedis } = await import('./app/lib/appLogPublisher')
    publishAppLogsToRedis()
    serverLog('info', 'next.started')
  }
}
