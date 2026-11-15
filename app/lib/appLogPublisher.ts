import { pubsub, TOPICS } from './pubsub'
import { setAppLogPublisher } from './appLog'

// Real-time delivery of application logs to the admin «logs» page.
export function publishAppLogsToRedis(): void {
    setAppLogPublisher(entry => pubsub.publish(TOPICS.APP_LOG, { appLogAdded: entry }))
}

// For short-lived processes (the worker): closes the Redis connections so that
// the process can exit.
export async function stopPublishingAppLogs(): Promise<void> {
    setAppLogPublisher(null)
    await pubsub.close()
}
