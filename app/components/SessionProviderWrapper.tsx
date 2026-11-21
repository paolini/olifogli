"use client"

import { SessionProvider } from "next-auth/react"
import { ReactNode } from "react"
import WebSocketStatus from './WebSocketStatus'

export default function SessionProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  // No session refetch when the tab regains focus: if the network is still down
  // (e.g. right after the computer wakes) next-auth 4 turns the failed request
  // into a null session and stops refetching, so the page behaves as logged out
  // until it is reloaded. Servers check the session on every request anyway,
  // and logout still propagates between tabs.
  return <SessionProvider refetchOnWindowFocus={false}><WebSocketStatus />{children}</SessionProvider>;
}
