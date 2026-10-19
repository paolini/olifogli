import { logDiagnostic } from '../../lib/logging'
import { queryOlimanager, OlimanagerGraphQLError } from "@/app/lib/olimanager"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
    try {
        const data = await queryOlimanager(req, `
            query MyQuery {
                users {
                    me {
                    id
                    email
                    fullName
                    }
                }
            }
        `)
        return Response.json(data)
    } catch (err) {
        if (err instanceof OlimanagerGraphQLError && err.isAuthError) {
            return Response.json(
                { error: "Permessi insufficienti su olimanager", detail: err.message },
                { status: 403 }
            )
        }
        logDiagnostic('app/api/test/route.operation_failed', err)
        return Response.json({ error: "Errore interno" }, { status: 500 })
    }
}
