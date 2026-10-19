import type { NextRequest } from 'next/server'
import { queryOlimanager, requireOlimanagerApiSession } from '@/app/lib/olimanager'

/** Server-only adapter for the existing transfer resolvers, using the caller's OAuth session. */
export class OlimanagerApi {
  private req: NextRequest

  constructor(req: NextRequest | undefined) {
    if (!req) throw new Error('Il trasferimento a Olimanager richiede una sessione OAuth HTTP.')
    this.req = req
  }

  static async create(req: NextRequest | undefined): Promise<OlimanagerApi> {
    const api = new OlimanagerApi(req)
    await requireOlimanagerApiSession(api.req)
    return api
  }

  async query(query: string, variables: Record<string, unknown> = {}): Promise<{
    // Preserve the dynamic provider response shape used by the existing resolvers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
    errors?: { message: string }[]
  }> {
    return { data: await queryOlimanager(this.req, query, variables) }
  }
}
