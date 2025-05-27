import { useSession, signIn, signOut } from "next-auth/react"
import Button from "@/app/components/Button"

export default function UserProfile() {
  const { data: session } = useSession()

  return <div className="px-1">
    { session 
      ? <LoggedInUserProfile user={session.user} /> 
      : <Button onClick={() => signIn()}>Login</Button>
    }
    <pre>
      {JSON.stringify({session}, null, 2)}
    </pre>
  </div>
}

function LoggedInUserProfile({user}:{user: {email?: string|null|undefined}|undefined}) {
  return <p>
      {user?.email || "<no email>"}
      <br/>
      <Button onClick={() => signOut()}>Logout</Button>
  </p>
}