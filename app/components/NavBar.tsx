import Link from "next/link";
import { signIn, signOut } from "next-auth/react"
import { gql } from '@apollo/client';

import packageJson from '@/package.json'
import useProfile from '@/app/lib/useProfile'
import { useBreadcrumbs } from '@/app/components/BreadcrumbsProvider'
import { useConfig } from '@/app/components/ConfigProvider'

const version = packageJson.version

export default function Navbar() {
  const { serverName, serverBackgroundColor, appInstance } = useConfig();
  const profile = useProfile();
  const linkClass = "text-gray-700 hover:text-blue-500";
  const { breadcrumbs } = useBreadcrumbs();
  
  return (
    <nav className="navbar" style={{ backgroundColor: serverBackgroundColor }}>
      <div className="flex justify-between items-center p-2">
        <div className="flex items-center gap-2" title={`${appInstance}`}>
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
          {(profile?.isAdmin || profile?.isSupervisor) && <Link href="/users" className={linkClass}>utenti</Link>}
          {profile && <a className={linkClass} href="#" onClick={() => signOut()}>logout</a>}
          {!profile && <a className={linkClass} href="#" onClick={() => signIn()}>login</a>}
        </div>
      </div>
    </nav>
  );
}
