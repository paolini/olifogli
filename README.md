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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

