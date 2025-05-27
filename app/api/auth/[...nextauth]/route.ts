import NextAuth, { NextAuthOptions } from "next-auth"

const { 
  OLIMANAGER_OAUTH_CLIENT_ID, 
  OLIMANAGER_OAUTH_CLIENT_SECRET, 
  OLIMANAGER_URL, // example: https://staging.olimpiadi-scientifiche.it
  NEXTAUTH_SECRET,
} = process.env

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
        params: { scope: "openid email profile" }, // niente "openid" // era "read write"
      },
      token: `${OLIMANAGER_URL}/o/token/`,
      userinfo: `${OLIMANAGER_URL}/o/userinfo/`,
      profile(profile: any) {
        return {
          id: profile.sub,
          name: profile.username,
          email: profile.email,
        }
      },
    })
  }
  return providers
}

export const authOptions = {
  secret: NEXTAUTH_SECRET, // FONDAMENTALE per produzione per firmare i JWT di sessione!
  debug: true,
  // Configure one or more authentication providers
  providers: providers(),
/*  callbacks: {
    async jwt({ token, account }: any) {
      if (account?.access_token) {
        console.log("Access Token ottenuto:", account.access_token)
      }
      return token
    }
  }*/
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }