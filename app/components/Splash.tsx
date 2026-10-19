import { useSession, signIn } from "next-auth/react"
import { useState } from 'react'

import Workbooks from './Workbooks'
import Button from './Button'
import useProfile from "../lib/useProfile"
import GlobalMessage from './GlobalMessage'
import { useConfig } from './ConfigProvider'

export default function Splash() {
  const { data: session } = useSession()
  const profile = useProfile()
  const { olimanagerUrl } = useConfig()
  const [requestApiScope, setRequestApiScope] = useState(false)

  if (session === undefined) return null

  if (!session?.user) return <div>
    <p className="mx-4 my-4">
      Devi avere un account su <a className="underline" href={olimanagerUrl}>olimpiadi-scientifiche</a> per accedere.
    </p>
    <GlobalMessage name="public_login_message" description="⚙ informazioni presentate prima del login"/>
    <div className="flex flex-wrap items-center">
      <Button className="px-10 py-5 m-5 rounded" onClick={async () => {
        await signIn('olimanager', undefined, {
          scope: requestApiScope ? 'openid email profile api' : 'openid email profile',
        })
      }}><b>LOGIN</b></Button>
      <label className="mx-4 flex items-center gap-2">
        <input type="checkbox" checked={requestApiScope} onChange={event => setRequestApiScope(event.target.checked)} />
        Non selezionare questo checkbox (richiesta api scope)
      </label>
    </div>
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
    <GlobalMessage name="home_footer_message"
      description="Messaggio a piè di pagina della home page"
    />
  </div>
}
