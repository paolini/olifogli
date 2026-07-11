## Getting Started

Store your local configuration in the `.env` file. Adjust the followings lines to your needs:

```
MONGODB_URI=mongodb://127.0.0.1:27017/olifogli?directConnection=true
NEXTAUTH_SECRET=<random_string>
NEXTAUTH_URL=http://localhost:3000
OLIMANAGER_OAUTH_CLIENT_ID=...
OLIMANAGER_OAUTH_CLIENT_SECRET=...
OLIMANAGER_URL=https://staging.olimpiadi-scientifiche.it
ADMIN_EMAILS=myemail@somewhere.com
SCANS_SPOOL_DIR=<path_to_worker_spool_directory>
SCANS_DATA_DIR=<path_to_worker_data_directory>
```

Then run the development server:

```bash
npm ci
npm run dev
```

Or
```
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## integration with OMRChecker

See https://github.com/fph/archiomr/blob/main/worker.py

set SCANS_SPOOL_DIR and SCANS_DATA_DIR to enable

## OAuth2 Setup (olimanager ↔ olifogli)

olifogli authenticates against olimanager's OAuth2/OIDC provider via NextAuth, using the standard authorization code flow with PKCE. The relevant endpoints (authorize, token, userinfo, discovery) are exposed by olimanager's Django backend, not its Next.js frontend — the two are served on different origins.

**Local development:** olimanager runs as two separate services: the Next.js frontend on port 3000 and the Django backend on port 8000. Set OLIMANAGER_URL in olifogli's .env to http://localhost:8000 (not 3000). The callback/redirect URI is http://localhost:3001/api/auth/callback/olimanager.

** Production:** frontend and backend are served under the same public domain (e.g. https://olimpiadi-scientifiche.it), with routing (proxy/CDN) handling the split internally, so OLIMANAGER_URL should simply be the public domain. The callback/redirect URI is https://fogli-olimat.olimpiadi-scientifiche.it/api/auth/callback/olimanager.
OAuth2 Application configuration (both environments): a corresponding Application must exist in Django admin (/admin/oauth2_provider/application/) with:

client_type: Confidential
authorization_grant_type: Authorization code
redirect_uris: the appropriate callback URL above
algorithm: RSA with SHA-2 256 (RS256) — required whenever the openid scope is requested. If left unset, the token endpoint will fail with a 500 error (ImproperlyConfigured: This application does not support signed tokens) when trying to issue the id_token. This also requires OAUTH2_PROVIDER["OIDC_RSA_PRIVATE_KEY"] to be configured in Django settings for that environment.

⚠️ Client secret: the plaintext client_secret is displayed only once, on the confirmation screen right after creating the Application — copy it immediately into the corresponding env variable (OLIMANAGER_OAUTH_CLIENT_SECRET). If lost, the only fix is deleting and recreating the Application.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

