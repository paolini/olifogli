import { useSession, signIn } from "next-auth/react"

import Workbooks from './Workbooks'
import Button from './Button'
import Sheets from './Sheets'
import useProfile from "../lib/useProfile"

export default function Splash() {
  const { data: session } = useSession()
  const profile = useProfile()

  if (session === undefined) return null

  if (!session?.user) return <div>
    <Button className="px-10 py-5 m-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  if (profile?.isAdmin) {
    return <div>
      <Workbooks />
    </div>
  } 
  return <div>
    <Sheets />
  </div>
}