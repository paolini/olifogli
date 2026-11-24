'use client'
import { signIn, signOut } from 'next-auth/react'
import Button from './Button'

const SCOPE = 'openid email profile'
const API_SCOPE = 'openid email profile api'

// Olimanager login: LOGIN asks only for the identity; «LOGIN CON INTERFACCIA
// OLI-SCI» asks
// for the api scope too (Olimanager pages and transfers). Olimanager is a code
// name: users know the service as «olimpiadi scientifiche» (oli-sci). With returnHere the
// user comes back to the current page after the login (the home page does not
// need it).
export function LoginForm({ returnHere = false }: { returnHere?: boolean }) {
    const login = (scope: string) => signIn('olimanager', returnHere ? { callbackUrl: window.location.href } : undefined, { scope })
    return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 m-5">
        <Button className="px-10 py-5 rounded text-lg" onClick={async () => { await login(SCOPE) }}><b>LOGIN</b></Button>
        <div className="flex items-center gap-2">
            <Button className="px-3 py-1 rounded text-sm" variant="secondary" onClick={async () => { await login(API_SCOPE) }}>LOGIN CON INTERFACCIA OLI-SCI</Button>
            <span className="text-sm text-gray-600">permette a CD e RD di vedere le informazioni aggiornate sul loro distretto</span>
        </div>
    </div>
}

// Shown by Page instead of a page that needs a login; after the login the
// user is back on the same page.
export function LoginRequired() {
    return <div className="p-2">
        <p className="mx-2 my-2">Per vedere questa pagina devi fare login.</p>
        <LoginForm returnHere />
    </div>
}

// Asks to log in again with the api scope when Olimanager cannot be read:
// the scope was not granted or the token has expired (the scope is chosen
// only at login). Logs out and in again, back to the same page.
export function OlimanagerLogin({ expired, intro }: { expired: boolean, intro: string }) {
    return <div className="space-y-2">
        <p>{intro} {expired
            ? 'La sessione delle olimpiadi scientifiche è scaduta: devi rifare il login.'
            : 'Devi fare il login con interfaccia oli-sci.'}</p>
        <Button onClick={async () => {
            const callbackUrl = window.location.href
            await signOut({ redirect: false })
            await signIn('olimanager', { callbackUrl }, { scope: API_SCOPE })
        }}>Rientra con interfaccia oli-sci</Button>
    </div>
}

// Shown by Page instead of a page that reads Olimanager when it cannot.
export function ApiScopeRequired({ expired }: { expired: boolean }) {
    return <div className="p-4">
        <OlimanagerLogin expired={expired} intro="Questa pagina legge i dati delle olimpiadi scientifiche." />
    </div>
}
