## Goal

Finish `app/public-website` as the mobile-first Vercel retrieval portal for a published Photo Strip or Flipbook. Supabase lookups and rate-limit RPC calls will execute only through a server function marked `'use server'`; browser code will receive only filtered published-output metadata and a public Cloudinary delivery URL.

## Source Of Truth

- [PRD: Deployed Website and Publishing and Retrieval contract](../docs/PRD.md#deployed-website)
- [PRD: Testing Decisions for the Deployed Website](../docs/PRD.md#deployed-website-testing)
- [Traceability Matrix: EPIC-08](../docs/traceability-matrix.md#epic-08-cloud-publishing--public-website)
- [System architecture: Online Web Application](../docs/system-architecture.md#3-online-web-application)
- [Public website route implementation](../app/public-website/src/app/[id]/page.tsx)
- [Public output Supabase policy and lookup limiter](../supabase/migrations/20260905000000_public_outputs.sql)
- [Retrieval-site component boundaries](../agents/component-breakdowns.md)

## Non-Goals

- Do not contact the local Fastify backend, local PostgreSQL, or local filesystem from the public website.
- Do not add accounts, gallery browsing, search, output editing, analytics, or public booth administration.
- Do not proxy finalized PNG/GIF files through Vercel. A Cloudinary delivery URL is a deliberately public asset URL; only Supabase/RPC API calls are required to remain server-side.
- Do not change the publishing worker, Cloudinary uploader, retention Edge Function, or retention period except for the Supabase read-policy hardening needed by this website.

## Execution Order

## PR Stacking Strategy

Keep this as three small stacked PRs so the data boundary is independently reviewable before the visual work lands:

```text
dev
└── public-website/server-only-lookup
    └── public-website/retrieval-experience
        └── public-website/public-website-tests
```

Merge in the order shown. Use Graphite if it is already configured; otherwise create each branch from its parent with Git and target each PR at the preceding branch. Do not deploy the Supabase migration without explicit approval.

## Linear Sub-Issue Tracking

Create sub-issues from this plan when ready; no Linear parent issue was provided.

### 1. Establish The Server-Only Public Lookup Boundary

- Touch `app/public-website/src/app/[id]/actions.ts`, `app/public-website/src/lib/public-output.ts`, `app/public-website/src/app/[id]/page.tsx`, `app/public-website/.env.example`, and `app/public-website/README.md`.
- Put `'use server'` in `actions.ts`; validate the seven-character ID again, read the request address with `headers()`, consume the lookup token, then delegate to a `server-only` data-access module that uses only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`). Map the single Supabase row into `PublicOutputMetadata`, enforce `uploaded` and unexpired status defensively, return `null` for every failed/invalid lookup, and keep `notFound()` in the route page so unpublished, expired, malformed, misconfigured, rate-limited, and failed lookups all share the contract 404.
- Keep the DAL and action separate: the action is the callable boundary and validates untrusted input; the DAL owns the REST/RPC requests, timeout, response shape validation, and metadata filtering. This satisfies the server-call requirement without moving public asset delivery through Vercel or exposing a service key to a client bundle.

### 2. Close Anonymous Supabase Reads And Preserve The Cloud Contract

- Touch `supabase/migrations/<timestamp>_restrict_public_output_reads.sql`, `app/backend/test/supabase-publication.integration.test.ts`, `app/public-website/.env.example`, and `supabase/README.md` if its setup instructions name the browser-readable key.
- Add a forward migration that drops the `anon, authenticated` select policy and revoke their table select privilege, leaving `service_role` publishing, the service-only lookup limiter RPC, expiry enforcement, and the existing retention cron intact. Update the integration test so a publishable/anonymous client cannot query `public_outputs`, while the service role can publish and the public-site server credentials can consume lookup tokens and resolve only a current published row.
- Before requesting deployment, run `supabase migration list --linked` and `supabase db push --dry-run`; record the migration as pending deployment rather than applying it. Configure only server-scoped Vercel variables, and document that Cloudinary delivery URLs are intentionally returned to the browser as public finalized media rather than management credentials.

### 3. Build The Finished Public Retrieval Experience

- Touch `app/public-website/src/app/layout.tsx`, `app/public-website/src/app/page.tsx`, `app/public-website/src/app/[id]/page.tsx`, `app/public-website/src/app/not-found.tsx`, `app/public-website/src/app/global.css`, and add focused presentation components under `app/public-website/src/components/` only where they remove real duplication.
- Preserve the captive portal's dark forest-green visual language, but make the public route feel like a permanent printed keepsake: a restrained editorial masthead, framed media stage, compact output/event metadata, clear download/save affordance, and a calm unavailable state. Establish explicit CSS tokens, use the existing Geist pair, maintain one responsive layout from narrow phones through desktop, support GIF playback with the normal image element, include visible focus states and reduced-motion handling, and avoid heavy client-side state or a generic card grid.
- Make `/` a purposeful public landing/recovery page that explains scanning the printed QR and accepts a seven-character ID or full permanent URL using the shared parser; its form should navigate to `/:id` without calling Supabase. Use the public URL as the download target and give it a deterministic filename/accessibility label; do not use `@photobooth/ui`'s current client `fetch(mediaUrl)` download helper because its browser asset fetch is unnecessary here and it does not strengthen the secret boundary.

### 4. Prove Public Retrieval Behavior And Update Project Records

- Add `app/public-website/src/lib/public-output.test.ts`, `app/public-website/src/app/[id]/page.test.tsx`, and any minimal test setup/mocks required by the repository's Vitest configuration; touch `agents/sitemap.md`, `agents/component-breakdowns.md`, and `docs/traceability-matrix.md` only after verification confirms the completed behavior.
- Cover valid ID lookup and rendered PNG/GIF metadata, malformed IDs, absent/unpublished/expired outputs, a denied rate-limit token, server-only environment failure, and proof that the rendered/client payload excludes Supabase credentials and internal Cloudinary identifiers. Keep tests behavior-focused and mock only the server data-access boundary; use a browser-level smoke check for narrow and desktop layouts, keyboard navigation, and the download link rather than asserting CSS implementation details.

## Acceptance Criteria

- `/:id` accepts only a valid seven-character base-62 ID and shows a finalized, unexpired published output from Supabase.
- Invalid, unpublished, expired, deleted, rate-limited, and failed lookups return the exact PRD unavailable message through `not-found.tsx`.
- Every Supabase REST/RPC call is reachable only from a `'use server'` action and its `server-only` data-access module; no `NEXT_PUBLIC_SUPABASE_*` or service-role key is referenced by public website client code.
- Anonymous/publishable Supabase clients cannot query `public_outputs` after the forward migration; the backend service role can still publish and retention can still remove outputs.
- The browser receives only public delivery metadata and the intentional Cloudinary media URL, never Supabase service credentials, local IDs, filesystem paths, or Cloudinary management data.
- The public route and recovery landing page are usable, accessible, and visually coherent on mobile and desktop, including image and GIF output types.
- Focused tests pass along with `pnpm --filter public-website lint`, `pnpm --filter public-website typecheck`, `pnpm --filter public-website build`, and the applicable root Vitest command.
- `docs/traceability-matrix.md` is not marked complete until the implementation and verification above are complete; it currently overstates TSK-0805 and TSK-0806 relative to the app.
