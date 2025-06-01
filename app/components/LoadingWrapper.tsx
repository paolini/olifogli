import { useEffect, useState, ReactNode } from "react"

import Loading from './Loading'

export default function LoadingWrapper({ children } : {
    children: ReactNode
}) {
    const [showContent, setShowContent] = useState(false);
    const delay = 0
    useEffect(() => {
      setShowContent(false)
      const timeout = setTimeout(() => {
        requestAnimationFrame(() => {
          setShowContent(true)
        })
      }, delay)
  
      return () => clearTimeout(timeout);
    }, [])
  
    return showContent ? children : <Loading />
}