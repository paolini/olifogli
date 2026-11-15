// Main loop of the background worker. An error in one iteration (a failed job,
// a transient MongoDB error, a lost lease) is logged and retried after a
// growing pause: the worker keeps running, so the in-memory keys of the other
// encryption jobs are not lost with the process.
export type WorkerLoopOptions = {
    // Runs one iteration; returns true when a job was processed.
    iteration: () => Promise<boolean>
    shouldStop: () => boolean
    // Stop after the first iteration (`--once`); errors are then rethrown.
    once?: boolean
    onError: (error: unknown, consecutiveFailures: number) => void
    delay: (ms: number) => Promise<unknown>
    idleMs?: number
    maxBackoffMs?: number
}

export async function runWorkerLoop(options: WorkerLoopOptions): Promise<boolean | undefined> {
    const idleMs = options.idleMs ?? 1000
    const maxBackoffMs = options.maxBackoffMs ?? 30_000
    let failures = 0
    do {
        let processed: boolean
        try {
            processed = await options.iteration()
            failures = 0
        } catch (error) {
            if (options.once) throw error
            failures++
            options.onError(error, failures)
            await options.delay(Math.min(maxBackoffMs, idleMs * 2 ** (failures - 1)))
            continue
        }
        if (options.once) return processed
        if (!processed && !options.shouldStop()) await options.delay(idleMs)
    } while (!options.shouldStop())
    return undefined
}
