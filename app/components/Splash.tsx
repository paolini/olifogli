import { useSession } from "next-auth/react"

import Workbooks from './Workbooks'
import { OlimanagerOlympiads } from './OlimanagerOlympiads'
import { LoginForm } from './LoginForm'
import useProfile from "../lib/useProfile"
import GlobalMessage from './GlobalMessage'
import { useConfig } from './ConfigProvider'

export default function Splash() {
  const { data: session } = useSession()
  const profile = useProfile()
  const { olimanagerUrl } = useConfig()

  if (session === undefined) return null

  if (!session?.user) return <div>
    <p className="mx-4 my-4">
      Devi avere un account su <a className="underline" href={olimanagerUrl}>olimpiadi-scientifiche</a> per accedere.
    </p>
    <GlobalMessage name="public_login_message" description="⚙ informazioni presentate prima del login"/>
    <LoginForm />
  </div>

  return <div>
    <GlobalMessage name="home_message"
      description="Messaggio della home page"
    />
    { profile?.isAdmin &&
          <GlobalMessage name="public_login_message" title="⚙ not logged message" description="informazioni presentate prima del login" collapsed={true}/>
    }
    <GlobalMessage name="instructions"
      title="dettagli"
      description="⚙ istruzioni per l'uso della piattaforma"
      collapsed={true}
    />
    <Workbooks />
    <OlimanagerOlympiads ready={session.olimanagerApiReady === true} expired={session.olimanagerApiScope === true} />
    <GlobalMessage name="home_footer_message"
      description="Messaggio a piè di pagina della home page"
    />
  </div>
}
