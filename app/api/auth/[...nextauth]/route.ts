import NextAuth, { NextAuthOptions } from "next-auth"

const { 
  OLIMANAGER_OAUTH_CLIENT_ID, 
  OLIMANAGER_OAUTH_CLIENT_SECRET, 
  OLIMANAGER_URL, // example: https://staging.olimpiadi-scientifiche.it
  NEXTAUTH_URL, // example: http://localhost:3000
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
      clientId: OLIMANAGER_OAUTH_CLIENT_ID,
      clientSecret: OLIMANAGER_OAUTH_CLIENT_SECRET,
      authorization: `${OLIMANAGER_URL}/o/authorize/`,
      token: {
        url: `${OLIMANAGER_URL}/o/token/`,
        /*
        request: async (context) => {
          const { provider, params } = context
          const basicAuth = Buffer
            .from(`${provider.clientId}:${provider.clientSecret}`)
            .toString("base64")

          if (!provider.token) throw new Error("Missing provider token URL")

          const URL = `${OLIMANAGER_URL}/o/token/`
          console.log("fetch URL", URL)

          const res = await fetch(URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": `Basic ${basicAuth}`, // ✅ auth via header
            },
            body: new URLSearchParams({
              ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
              grant_type: "authorization_code",
              code: params.code as string,
              redirect_uri: `${NEXTAUTH_URL}/api/auth/callback/${provider.id}`,
              // redirect_uri: `${context.req.headers.origin}/api/auth/callback/olimanager`, // TODO: check if this is needed
              }
            )
          })

          console.log("token res", res.status, res.statusText, await res.text())

          const data = await res.json()

          if (!res.ok) {
            throw new Error(JSON.stringify(data))
          }

          return data
        },*/
      },
      userinfo: `${OLIMANAGER_URL}/o/userinfo/`,
      profile(profile: any) {
        return {
          id: profile.id,
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