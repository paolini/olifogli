'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface Breadcrumb {
  label: string
  href?: string
  title?: string // tooltip, e.g. to explain where the link leads
}

interface BreadcrumbsContextType {
  breadcrumbs: Breadcrumb[]
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void
}

const BreadcrumbsContext = createContext<BreadcrumbsContextType | undefined>(undefined)

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([])

  return (
    <BreadcrumbsContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbsContext.Provider>
  )
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbsContext)
  if (context === undefined) {
    throw new Error('useBreadcrumbs must be used within a BreadcrumbsProvider')
  }
  return context
}

// Sets the header breadcrumbs while mounted. The effect depends on their
// text, not on the array, so a new array with the same crumbs does not loop.
export function HeaderBreadcrumbs({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  const { setBreadcrumbs } = useBreadcrumbs()
  const key = JSON.stringify(breadcrumbs)
  useEffect(() => {
    setBreadcrumbs(JSON.parse(key))
    return () => setBreadcrumbs([])
  }, [key, setBreadcrumbs])
  return null
}

// The title of a simple page, shown as the only breadcrumb.
export function PageBreadcrumb({ label, title }: Breadcrumb) {
  return <HeaderBreadcrumbs breadcrumbs={[{ label, title }]} />
}
