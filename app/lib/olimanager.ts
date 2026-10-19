import { logOlimanagerEvent } from './logging'
import { getToken, type JWT } from "next-auth/jwt"
import type { NextRequest } from "next/server"
const OLIMANAGER_GRAPHQL_URL = `${process.env.OLIMANAGER_GRAPHQL_ENDPOINT}`

interface GraphQLResponse<T> {
  data?: T
  errors?: { message: string; extensions?: Record<string, unknown> }[]
}

export class OlimanagerGraphQLError extends Error {
  status: number
  isAuthError: boolean

  constructor(status: number, message: string) {
    super(message)
    this.name = "OlimanagerGraphQLError"
    this.status = status
    this.isAuthError = status === 401 || status === 403
  }
}

function checkOlimanagerToken(token: JWT | null): void {
  if (typeof token?.accessToken !== 'string' || !token.accessToken) {
    throw new OlimanagerGraphQLError(401, 'Sessione OAuth Olimanager assente. Esci e accedi nuovamente.')
  }
  if (typeof token.accessTokenExpiresAt === 'number' && token.accessTokenExpiresAt <= Date.now() / 1000) {
    throw new OlimanagerGraphQLError(401, 'Il token Olimanager è scaduto. Esci e accedi nuovamente con «Abilita trasferimenti a Olimanager (scope api)».')
  }
  if (token.accessTokenHasApiScope === false) {
    throw new OlimanagerGraphQLError(403, 'Questa sessione non ha lo scope api. Esci e accedi nuovamente selezionando «Abilita trasferimenti a Olimanager (scope api)».')
  }
  if (token.accessTokenHasApiScope !== true) {
    throw new OlimanagerGraphQLError(403, 'Lo scope api della sessione non è verificabile. Esci e accedi nuovamente selezionando «Abilita trasferimenti a Olimanager (scope api)».')
  }
}

export async function requireOlimanagerApiSession(req: NextRequest): Promise<void> {
  checkOlimanagerToken(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }))
}

export async function queryOlimanager<T = unknown>(
  req: NextRequest,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  // Read credentials on the server without exposing them in the public session.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const accessToken = token?.accessToken
  const expiresInSeconds = typeof token?.accessTokenExpiresAt === 'number'
    ? Math.floor(token.accessTokenExpiresAt - Date.now() / 1000) : null
  const endpointOrigin = (value: string | undefined) => {
    try { return new URL(value || '').origin } catch { return null }
  }
  const graphqlOrigin = endpointOrigin(process.env.OLIMANAGER_GRAPHQL_ENDPOINT)
  const providerOrigin = endpointOrigin(process.env.OLIMANAGER_URL)
  // Allowlisted metadata only: never log tokens, cookies, queries or response bodies.
  logOlimanagerEvent('graphql_auth', {
    hasSession: !!token,
    hasAccessToken: typeof accessToken === 'string' && !!accessToken,
    hasApiScope: typeof token?.accessTokenHasApiScope === 'boolean'
      ? token.accessTokenHasApiScope : null,
    expiresInSeconds,
    accessTokenExpired: expiresInSeconds === null ? null : expiresInSeconds <= 0,
    graphqlOrigin,
    providerOrigin,
    sameOrigin: graphqlOrigin && providerOrigin ? graphqlOrigin === providerOrigin : null,
  })
  checkOlimanagerToken(token)

  const res = await fetch(OLIMANAGER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store", // dati autenticati, evita cache di default di fetch in RSC
  })
  logOlimanagerEvent('graphql_response', {
    status: res.status,
    redirected: res.redirected,
  })

  const rawBody = await res.text()
  let parsedBody: GraphQLResponse<T> | null = null
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null
  } catch {}

  if (!res.ok) {
    const detail = parsedBody?.errors ? JSON.stringify(parsedBody.errors) : rawBody
    throw new OlimanagerGraphQLError(res.status, detail)
  }

  if (parsedBody?.errors) {
    throw new Error(parsedBody.errors.map((e) => e.message).join(", "))
  }

  if (!parsedBody || parsedBody.data === undefined) {
    throw new Error("Risposta GraphQL di Olimanager priva di dati")
  }

  return parsedBody.data
}
