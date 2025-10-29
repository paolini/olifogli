'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

export interface Breadcrumb {
  label: string
  href?: string
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
