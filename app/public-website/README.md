# UMak SIC Photobooth Public Website

The Vercel-hosted retrieval website resolves a public seven-character output ID to finalized Cloudinary media. It never contacts the local photobooth backend.

## Getting Started

From the repository root, configure the server-only Supabase values:

```bash
cp app/public-website/.env.example app/public-website/.env.local
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `app/public-website/.env.local` for development, and in Vercel for deployment. Do not set either value with a `NEXT_PUBLIC_` prefix.

```bash
pnpm --filter public-website dev
```

Open [http://localhost:3002](http://localhost:3002). The public output route is `/:id`.

## Security Boundary

- Supabase REST and rate-limit RPC requests run only through `'use server'` modules.
- The Supabase service role key is never available to browser code.
- Browser code receives only approved delivery metadata and a public Cloudinary asset URL.
- Cloudinary delivery URLs are public by design; they are not Cloudinary management credentials.

## Checks

```bash
pnpm --filter public-website lint
pnpm --filter public-website typecheck
pnpm --filter public-website build
pnpm vitest run app/public-website
```
