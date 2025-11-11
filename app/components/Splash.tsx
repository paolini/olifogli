import { useSession, signIn } from "next-auth/react"

import Workbooks from './Workbooks'
import Button from './Button'
import useProfile from "../lib/useProfile"
import GlobalMessage from './GlobalMessage'

export default function Splash() {
  const { data: session } = useSession()
  const profile = useProfile()

  if (session === undefined) return null

  if (!session?.user) return <div>
    <Button className="px-10 py-5 m-5" onClick={() => signIn()}>LOGIN</Button>
  </div>

  return <div>
    <GlobalMessage name="home_message"
      description="Messaggio della home page"
    />
    <GlobalMessage name="instructions"
      title="dettagli"
      description="Istruzioni per l'uso della piattaforma"
      collapsed={true}
    />
    <Workbooks />
  </div>
}