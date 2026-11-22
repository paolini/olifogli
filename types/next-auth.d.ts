import 'next-auth'

declare module 'next-auth' {
    interface Session {
        // Granted scope only; OAuth credentials remain server-side.
        olimanagerApiScope?: boolean | null
        // Token present, with api scope and not expired (computed server side).
        olimanagerApiReady?: boolean
    }
}
