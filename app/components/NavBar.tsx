import Link from "next/link";
import { signIn, signOut } from "next-auth/react"

import packageJson from '@/package.json'
import useProfile from '@/app/lib/useProfile'

const version = packageJson.version
const app_instance = process.env.NEXT_PUBLIC_APP_INSTANCE
export default function Navbar() {
  const profile = useProfile()
  const linkClass = "text-gray-700 hover:text-blue-500"
  return <nav className="flex justify-between items-center p-4 bg-white shadow-md">
      <div className="text-xl font-bold"><Link href="/">olifogli {version}</Link>
      {app_instance && <span className="ml-2 text-sm font-normal text-gray-500">({app_instance})</span>}
      </div>
      <div className="hidden md:flex space-x-4">
        { profile && <i>{profile?.email}</i>}
        { profile?.isAdmin && <Link href="/users" className={linkClass}>utenti</Link>}
        { profile && <a className={linkClass} href="#" onClick={() => signOut()}>logout</a> }
        { !profile && <a className={linkClass} href="#" onClick={() => signIn()}>login</a> }
      </div>
    </nav>
}
