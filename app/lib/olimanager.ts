import { getToken } from "next-auth/jwt"
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

export async function queryOlimanager<T = unknown>(
  req: NextRequest,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  // Read credentials on the server without exposing them in the public session.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const accessToken = token?.accessToken
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Non autenticato: nessun accessToken disponibile")
  }

  const res = await fetch(OLIMANAGER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store", // dati autenticati, evita cache di default di fetch in RSC
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
