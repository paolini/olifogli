export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { serverLog } = await import('./app/lib/logging')
    const { publishAppLogsToRedis } = await import('./app/lib/appLogPublisher')
    publishAppLogsToRedis()
    serverLog('info', 'next.started')
  }
}
