import NextAuth from "next-auth"
import OAuthProvider from "next-auth/providers/github"

export const authOptions = {
  // Configure one or more authentication providers
  providers: [
    OAuthProvider({
        id: "olimanager",
        name: "olimpiadi-scientifiche",
        clientId: process.env.OAUTH_CLIENT_ID!,
        clientSecret: process.env.OAUTH_CLIENT_SECRET!,
        authorization: {
            url: "https://example.com/o/authorize/",
            params: { scope: "read" },
          },
          token: "https://example.com/o/token/",
          userinfo: "https://example.com/o/userinfo/",
          profile(profile) {
            return {
              id: profile.id,
              name: profile.username,
              email: profile.email,
            };
          },    }),
    // ...add more providers here
  ],
}

export default NextAuth(authOptions)