"use client"

import { SessionProvider } from "next-auth/react"
import { ReactNode } from "react"
import WebSocketStatus from './WebSocketStatus'

export default function SessionProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return <SessionProvider><WebSocketStatus />{children}</SessionProvider>;
}
