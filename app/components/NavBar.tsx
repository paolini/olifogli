import Link from "next/link";
import { signIn, signOut } from "next-auth/react"
import { gql, useQuery } from '@apollo/client';

import packageJson from '@/package.json'
import useProfile from '@/app/lib/useProfile'
import { useBreadcrumbs } from '@/app/components/BreadcrumbsProvider'

const version = packageJson.version
const APP_INSTANCE_QUERY = gql`
  query AppInstance {
    appInstance
  }
`;

export default function Navbar() {
  const profile = useProfile();
  const linkClass = "text-gray-700 hover:text-blue-500";
  const { data } = useQuery(APP_INSTANCE_QUERY); 
  const { breadcrumbs } = useBreadcrumbs();
  
  return (
    <nav className="navbar">
      <div className="flex justify-between items-center p-2">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-2xl font-bold hover:text-blue-600">
            Olifogli {version}
          </Link>
          {data?.appInstance && (
            <span className="text-sm font-normal text-gray-500">({data.appInstance})</span>
          )}
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
