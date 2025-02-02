## Getting Started

Store your local configuration in the `.env` file. Adjust the followings lines to your needs:

```
MONGODB_URI=mongodb://127.0.0.1:27017/olifogli?directConnection=true
NEXTAUTH_SECRET=6aIew1IZKRIM0Zpo2tm347ornHDl3Omt
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

## Configure olimanager openid login

Ask to olimanager admins to add the following information to the `oss` table:
```
domain: localhost:3000
issuer: your@email.com
audience: localhost:3000
```

They should create a private/public keypair with something like:
```
openssl genrsa -out privateKey.pem 512 
```
The private key is inserted in olimanager `private_key` field, while public key must be made available in environment variables in this server.
Edit your `.env` file (use quotes and replace newlines with `\n` to obtain a single line):
```
[...]
OLIMANAGER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nxxxxxxXXXXXXXXXXXXXXXXXXXXXXXXXXXX/xXXXXXXXXXXXXXXXXXXXXXXXXXX\nXXXXXXXXXXXXXXXXX+XXXXXXXXXXXXXXXXXXXX==\n-----END PUBLIC KEY-----"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

