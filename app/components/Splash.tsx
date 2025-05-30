import { useSession, signIn } from "next-auth/react"

import Sheets from './Sheets'
import Button from './Button'

export default function Splash() {
  const { data: session } = useSession()

  if (session === undefined) return null

  if (!session?.user) return <div>
    <Button className="px-10 py-5 m-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  return <div>
    <Sheets />
  </div>
}