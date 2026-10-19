import { logDiagnostic, logOlimanagerEvent } from './logging'
import type { AuthOptions, NextAuthOptions } from "next-auth"

import { getUsersCollection, getAccountsCollection } from "@/app/lib/mongodb"

const { 
  OLIMANAGER_OAUTH_CLIENT_ID, 
  OLIMANAGER_OAUTH_CLIENT_SECRET, 
  OLIMANAGER_URL, // example: https://staging.olimpiadi-scientifiche.it
  NEXTAUTH_SECRET,
} = process.env

export type OLIMANAGER_TOKEN = {
  user_id?: string
  name?: string | null
  email?: string | null
  accessToken?: string
  accessTokenExpiresAt?: number | null
  accessTokenHasApiScope?: boolean | null
  is_admin?: boolean
}

type OLIMANAGER_PROFILE = {
  aud: string
  iat: number
  at_hash: string
  sub: string
  name: string // firstname
  surname: string
  school?: unknown[] 
  email: string
  roles?: ("teacher")[] 
  iss: "https://olimpiadi-scientifiche.it/o"
  exp: number
  auth_time: number,
  jti: string
}

type SESSION_USER = {
  _id?: string
  name?: string | null | undefined
  email?: string | null | undefined
  school?: unknown[]
  roles?: string[]
  image?: string | null | undefined
  is_admin?: boolean
}

type ACCOUNT = {
  access_token?: string
  refresh_token?: string
  expires_at?: number | null
  scope?: string
  id_token?: string
  provider: string
  providerAccountId: string
}

type SESSION = {
  user?: SESSION_USER | undefined
  expires: string
}

if (!NEXTAUTH_SECRET) throw new Error("Missing environment variable: NEXTAUTH_SECRET")

function providers() {
  const providers: NextAuthOptions["providers"] = []
  if (OLIMANAGER_OAUTH_CLIENT_ID) {
    if (!OLIMANAGER_OAUTH_CLIENT_SECRET) throw new Error("Missing environment variable: OLIMANAGER_OAUTH_CLIENT_SECRET")
    if (!OLIMANAGER_URL) throw new Error("Missing environment variable: OLIMANAGER_URL")

    providers.push({
      type: "oauth",
      id: "olimanager",
      name: "olimpiadi-scientifiche",
      checks: ['pkce', 'state'],
      idToken: true,
      //issuer: `${OLIMANAGER_URL}/o`,
      wellKnown: `${OLIMANAGER_URL}/o/.well-known/openid-configuration`,
      clientId: OLIMANAGER_OAUTH_CLIENT_ID,
      clientSecret: OLIMANAGER_OAUTH_CLIENT_SECRET,
      authorization: {
        url: `${OLIMANAGER_URL}/o/authorize/`,
        params: { scope: "openid email profile" },
      },
      token: `${OLIMANAGER_URL}/o/token/`,
      userinfo: `${OLIMANAGER_URL}/o/userinfo/`,
      profile(profile: OLIMANAGER_PROFILE) {
        // console.log("Profile ottenuto da Olimanager:", JSON.stringify({profile}, null, 2))
        // verrà passato alla callback signIn
        return {
          id: profile.sub,
          name: profile.surname ? `${profile.name} ${profile.surname}` : profile.name,
          email: profile.email,
          school: profile?.school || null,
          roles: profile?.roles || [],
        }
      },
    })
  }
  return providers
}

export const authOptions: AuthOptions = {
  secret: NEXTAUTH_SECRET, // FONDAMENTALE per produzione per firmare i JWT di sessione!
  debug: false,
  logger: {
    error(code) { logDiagnostic('auth.provider_error', { code }) },
    warn(code) { logDiagnostic('auth.provider_warning', { code }, 'warn') },
    debug() {},
  },
  // Configure one or more authentication providers
  providers: providers(),
  callbacks: {
    async jwt({ token, user, account }: {
      token: OLIMANAGER_TOKEN
      user?: SESSION_USER
      account?: ACCOUNT | null
    }) {
      // console.log("JWT callback:", JSON.stringify({ token, user, account }, null, 2))
      if (user) {
          // solo al login
          token.user_id = user._id 
          token.name = user.name
          token.email = user.email
      }    

      // ad ogni richiesta
      // Memorizza l'access token, se disponibile
      if (account?.access_token) {
        token.accessToken = account.access_token
        token.accessTokenExpiresAt = account.expires_at ?? null
        token.accessTokenHasApiScope = typeof account.scope === 'string'
          ? account.scope.split(/\s+/).includes('api') : null
        logOlimanagerEvent('oauth_login', {
          hasApiScope: token.accessTokenHasApiScope,
          expiresInSeconds: token.accessTokenExpiresAt === null
            ? null : Math.floor(token.accessTokenExpiresAt - Date.now() / 1000),
        })
      }

      return token
    },

    async session({ session, token }: {
      session: SESSION,
      token: OLIMANAGER_TOKEN,
    }) {
      // console.log("Session callback:", JSON.stringify({ session, token }, null, 2))
      if (token.user_id && session.user) session.user._id = token.user_id
      // This callback also supplies /api/auth/session to the browser.
      // OAuth credentials must remain in the encrypted, HttpOnly JWT cookie.
      return session
    },

    signIn: async ({ user, account }: {
      user: SESSION_USER
      account?: ACCOUNT | null
    }) => {
      if (!user.email) {
        logDiagnostic('app/lib/auth.signin_callback_user_email_is_required_but_not_provided', undefined)
        return false // blocca il login se l'email non è presente
      }

      // console.log("SignIn callback:", JSON.stringify({ user, account }, null, 2))
      const users = await getUsersCollection()
      const accounts = await getAccountsCollection()

      // Trova o crea l'utente
      let existingUser = await users.findOne({ email: user.email })

      if (!existingUser) {
        const newUser = {
          email: user.email,
          name: user.name || '', 
          createdAt: new Date(),
          lastLogin: new Date(),
          isAdmin: false,
        }
        const result = await users.insertOne(newUser)
        existingUser = { _id: result.insertedId, ...newUser }
      }

      // aggiorna l'user, verrà passato alla callback jwt per l'inserimento nel token
      user._id = existingUser._id.toString()
      // user.isAdmin = existingUser.isAdmin || false

      // Trova o aggiorna l'account
      if (account) {
        await accounts.updateOne(
          {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
          {
            $set: {
              userId: existingUser._id,
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
              idToken: account.id_token,
              updatedAt: new Date(),
              school: user?.school || null,
              roles: user?.roles || [],
            }
          },
          { upsert: true }
        )
      }

      // console.log("Sessione creata:", JSON.stringify({ user, account }, null, 2))

      return true
    }
  },
}

