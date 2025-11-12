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
    <GlobalMessage name="public_login_message" description="informazioni presentate prima del login"/>
    <Button className="px-10 py-5 m-5 rounded" onClick={() => signIn()}><b>LOGIN</b></Button>
  </div>

  return <div>
    <GlobalMessage name="home_message"
      description="Messaggio della home page"
    />
    { profile?.isAdmin &&
          <GlobalMessage name="public_login_message" title="not logged message" description="informazioni presentate prima del login" collapsed={true}/>
    }
    <GlobalMessage name="instructions"
      title="dettagli"
      description="Istruzioni per l'uso della piattaforma"
      collapsed={true}
    />
    <Workbooks />
  </div>
}