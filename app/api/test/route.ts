import { queryOlimanager, OlimanagerGraphQLError } from "@/app/lib/olimanager"

export async function GET() {
    try {
        const data = await queryOlimanager(`
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
        console.error(err)
        return Response.json({ error: "Errore interno" }, { status: 500 })
    }
}
