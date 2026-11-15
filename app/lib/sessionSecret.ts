// NEXTAUTH_SECRET protects sessions, OAuth delegations and the key transport of
// sheet encryption. A missing or placeholder value (like the ones in the
// example Compose files or the build-only value of the Dockerfile) must stop
// the service instead of running with a publicly known secret.
const PLACEHOLDERS = new Set(['', '...', 'dummysecret', 'build-only-not-a-secret', 'changeme', 'secret'])

export function checkSessionSecret(secret: string | undefined = process.env.NEXTAUTH_SECRET): void {
    if (!secret || PLACEHOLDERS.has(secret.trim())) {
        throw new Error('NEXTAUTH_SECRET mancante o di esempio: configurare lo stesso segreto in app, ws-server e worker.')
    }
}
