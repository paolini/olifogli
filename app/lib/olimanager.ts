// app/lib/olimanager-graphql.ts
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

// Declare module augmentation for next-auth to add accessToken to Session
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}
const OLIMANAGER_GRAPHQL_URL = `${process.env.OLIMANAGER_GRAPHQL_ENDPOINT}`

interface GraphQLResponse<T> {
  data?: T
  errors?: { message: string; extensions?: any }[]
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

export async function queryOlimanager<T = any>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const session = await getServerSession(authOptions)

  //  console.log("***** accessToken ***" + session.accessToken)

  if (!session?.accessToken) {
    throw new Error("Non autenticato: nessun accessToken disponibile")
  }

  const res = await fetch(OLIMANAGER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store", // dati autenticati, evita cache di default di fetch in RSC
  })

  const rawBody = await res.text()
  let parsedBody: any = null
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null
  } catch {}

  if (!res.ok) {
    const detail = parsedBody?.errors ? JSON.stringify(parsedBody.errors) : rawBody
    throw new OlimanagerGraphQLError(res.status, detail)
  }

  if (parsedBody?.errors) {
    throw new Error(parsedBody.errors.map((e: any) => e.message).join(", "))
  }

  return parsedBody.data
}
