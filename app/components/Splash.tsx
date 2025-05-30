import Link from 'next/link'
import { useSession, signIn } from "next-auth/react"

import Sheets from './Sheets'
import Button from './Button'
import useProfile from '@/app/lib/useProfile'

export default function Splash() {
  const profile = useProfile()
  const { data: session } = useSession()

  if (!session) return null

  if (!session?.user) return <div>
    <Button className="px-10 py-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  return <div>
    <pre>{JSON.stringify({profile})}</pre>
    { profile?.is_admin && <Link href="users">utenti</Link>}
    <Sheets />
  </div>
}