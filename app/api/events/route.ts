import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Redis from 'ioredis'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  // write helper
  const writeEvent = async (event: string, data: any) => {
    const chunk = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`
    await writer.write(new TextEncoder().encode(chunk))
  }

  // subscribe to relevant channels pattern
  const sub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')
  // Redis subscriber client created
  sub.on('ready', () => {})
  sub.on('error', (err) => { console.error('[SSE] Redis subscriber error', err) })
  await sub.psubscribe('*')

  sub.on('pmessage', async (_pattern, channel, message) => {
    let parsed = null
    try { parsed = JSON.parse(message) } catch (e) { parsed = { payload: message } }
    // debug log: notify server console when a message arrives
    // received redis message on channel
    // basic filter: here we could enforce authorization per channel
    await writeEvent(parsed.type || 'message', { channel, ...parsed })
  })

  // heartbeat
  const interval = setInterval(() => {
    writer.write(new TextEncoder().encode(': ping\n\n'))
  }, 25000)

  // new SSE client connected

  // close handling when client disconnects
  req.signal.addEventListener('abort', async () => {
    clearInterval(interval)
    try { await sub.quit() } catch (e) {}
    try { await redis.quit() } catch (e) {}
    try { await writer.close() } catch (e) {}
    // client connection aborted, cleaned up
  })

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  return new NextResponse(readable, { headers })
}
