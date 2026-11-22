import Link from "next/link";
import { signIn } from "next-auth/react"
import BackgroundOperations from './BackgroundOperations';
import UserMenu from './UserMenu';

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
                    <Link href={breadcrumb.href} className="hover:text-blue-500" title={breadcrumb.title}>
                      {breadcrumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-800" title={breadcrumb.title}>{breadcrumb.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {profile?.isAdmin && <BackgroundOperations />}
          {profile && <UserMenu email={profile.email} isAdmin={profile.isAdmin} isSupervisor={profile.isSupervisor} />}
          {!profile && <a className={linkClass} href="#" onClick={() => signIn()}>login</a>}
        </div>
      </div>
    </nav>
  );
}
