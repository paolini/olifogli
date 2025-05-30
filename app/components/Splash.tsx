import Link from 'next/link'
import { useSession, signIn } from "next-auth/react"

import Sheets from './Sheets'
import Button from './Button'

export default function Splash() {
  const { data: session } = useSession()

  if (!session?.user) return <div>
    <Button className="px-10 py-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  return <div>
    <Link href="users">utenti</Link>
    <Sheets />
  </div>
}