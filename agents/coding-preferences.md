# Coding Preferences

## === What's Here ===

Repository-specific rules that supplement the shared frontend standards.

## Defaults

- Prefer the smallest correct change and existing local patterns over new abstractions or dependencies.
- Keep domain rules in the Fastify backend. React and Next.js clients are untrusted.
- Treat `docs/PRD.md` as the product contract. Its Authoritative Implementation Contract takes precedence.
- Preserve local-first behavior. Capture, confirmation, printing, and local output retrieval must not depend on internet connectivity.
- Use seven-character cryptographically random base-62 public output IDs. Never expose sequential IDs or storage paths.
- Keep cloud publishing asynchronous and separate from booth confirmation.
- Browser applications use Tailwind CSS v4 through their app-level `global.css` file, beginning with `@import "tailwindcss";`.
- The Vite booth uses `@tailwindcss/vite`; Next.js applications use `@tailwindcss/postcss` through `postcss.config.mjs`.
- Photobooth client-owned cross-screen state uses domain-scoped Zustand stores with typed initial state, colocated actions, and atomic selectors. Backend workflow data remains server-owned.
- Run pnpm from the repository root. The root workspace owns the shared lockfile and package store; add a `packages/ui` workspace dependency only for retrieval components that are identical in both websites.

## Boundaries

- `app/backend/` is the only application with PostgreSQL access and filesystem authority.
- `app/photobooth-software/` must use backend APIs for persisted work and must not write arbitrary local files.
- `app/captive-website/` exposes guest-safe local retrieval only.
- `app/public-website/` resolves public IDs through Supabase/Cloudinary and never contacts the local backend.
- `packages/public-output/` owns shared public-ID parsing, validation, and public-output types.
- `packages/ui/` is only for retrieval UI that is genuinely identical in both websites.

## Before Finishing

- Update the sitemap or component breakdown when a durable route or boundary changes.
- Add the smallest behavior-focused test that protects non-trivial logic.
- Add a regression entry only after confirming a defect and its prevention.
- Update agent memory only with confirmed durable facts.
