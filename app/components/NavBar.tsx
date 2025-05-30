import Link from "next/link";
import { signIn, signOut } from "next-auth/react"

import packageJson from '@/package.json'
import useProfile from '@/app/lib/useProfile'

const version = packageJson.version
export default function Navbar() {
  const profile = useProfile()
  const linkClass = "text-gray-700 hover:text-blue-500"
  return <nav className="flex justify-between items-center p-4 bg-white shadow-md">
      <div className="text-xl font-bold"><Link href="/">olifogli {version}</Link></div>
      <div className="hidden md:flex space-x-4">
        { profile && <i>{profile?.email}</i>}
        { profile?.is_admin && <Link href="/users" className={linkClass}>utenti</Link>}
        { profile && <a className={linkClass} href="#" onClick={() => signOut()}>logout</a> }
        { !profile && <a className={linkClass} href="#" onClick={() => signIn()}>login</a> }
      </div>
    </nav>
}
