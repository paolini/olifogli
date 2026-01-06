import Link from "next/link";
import { signIn, signOut } from "next-auth/react"
import { gql, useQuery } from '@apollo/client';

import packageJson from '@/package.json'
import useProfile from '@/app/lib/useProfile'
import { useBreadcrumbs } from '@/app/components/BreadcrumbsProvider'

const version = packageJson.version
const _ = gql`
  query AppInstance {
    appInstance
  }
`;

const __ = gql`
  query Branding {
    serverName: getSetting(key: "server_name") {
      value
    }
    backgroundColor: getSetting(key: "server_background_color") {
      value
    }
  }
`

export default function Navbar() {
  const profile = useProfile();
  const linkClass = "text-gray-700 hover:text-blue-500";
  const { breadcrumbs } = useBreadcrumbs();
  const { data } = useQuery(__);
  
  const serverName = data?.serverName?.value || "Olifogli";
  const backgroundColor = data?.backgroundColor?.value;
  
  return (
    <nav className="navbar" style={{ backgroundColor }}>
      <div className="flex justify-between items-center p-2">
        <div className="flex items-center gap-2">
          <Link href="/" className="mx-2 text-2xl font-bold hover:text-blue-600">
            {serverName}<sup className="ml-1 text-xs font-normal">{version}</sup>
          </Link>
          {breadcrumbs.length > 0 && (
            <div className="flex items-center text-2xl font-bold text-gray-600">
              {breadcrumbs.map((breadcrumb, index) => (
                <span key={index} className="flex items-center">
                  <span className="mx-2">〉</span>
                  {breadcrumb.href ? (
                    <Link href={breadcrumb.href} className="hover:text-blue-500">
                      {breadcrumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-800">{breadcrumb.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="hidden md:flex space-x-4">
          {profile && <i>{profile?.email}</i>}
          {profile?.isAdmin && <Link href="/users" className={linkClass}>utenti</Link>}
          {profile && <a className={linkClass} href="#" onClick={() => signOut()}>logout</a>}
          {!profile && <a className={linkClass} href="#" onClick={() => signIn()}>login</a>}
        </div>
      </div>
    </nav>
  );
}
