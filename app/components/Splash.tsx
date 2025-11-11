import { useSession, signIn } from "next-auth/react"

import Workbooks from './Workbooks'
import Button from './Button'
import useProfile from "../lib/useProfile"
import HomeMessage from './HomeMessage'

export default function Splash() {
  const { data: session } = useSession()
  const profile = useProfile()

  if (session === undefined) return null

  if (!session?.user) return <div>
    <Button className="px-10 py-5 m-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  return <div>
    <HomeMessage />
    <Workbooks />
  </div>
}