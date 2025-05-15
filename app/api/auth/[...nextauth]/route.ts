import NextAuth, { NextAuthOptions } from "next-auth"

const { 
  OLIMANAGER_OAUTH_CLIENT_ID, 
  OLIMANAGER_OAUTH_CLIENT_SECRET, 
  OLIMANAGER_URL, // example: https://staging.olimpiadi-scientifiche.it
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
      checks: ['pkce'],
      idToken: false,
      issuer: `${OLIMANAGER_URL}/o`.replace('https://', 'http://'),
      //wellKnown: `${OLIMANAGER_URL}/o/.well-known/openid-configuration`,
      clientId: OLIMANAGER_OAUTH_CLIENT_ID,
      clientSecret: OLIMANAGER_OAUTH_CLIENT_SECRET,
      authorization: {
        url: `${OLIMANAGER_URL}/o/authorize/`,
        params: { scope: "email" }, // niente "openid" // era "read write"
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
  // Configure one or more authentication providers
  providers: providers(),
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }