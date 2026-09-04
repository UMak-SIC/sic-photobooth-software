# Agent Memory

## === What's Here ===

Confirmed, durable knowledge that helps future agents make correct changes. Do not add temporary work status, secrets, credentials, guesses, or duplicated PRD prose.

## Current Facts

- 2026-09-04: Each app is independently initialized with pnpm: Fastify/TypeScript backend on port 3000, React/Vite/TypeScript booth on port 5173, Captive Next.js on port 5174, and public Next.js on port 3001. Source: `app/` package manifests.
- 2026-09-04: The three browser applications use Tailwind CSS v4 with app-level `global.css` entry points. The booth uses the Vite plugin; both Next.js sites use the PostCSS plugin. Source: `app/` build configuration.
- 2026-09-04: The booth's `src/store/session-store.ts` is the Zustand domain store for its active session reference; it has no persistence middleware and does not replace backend workflow authority. Source: `app/photobooth-software/src/store/session-store.ts`.
- 2026-09-04: The root `pnpm-workspace.yaml` owns the lockfile and package store for all `app/*` applications and future `packages/*` workspaces. Source: `pnpm-workspace.yaml`.
- The PRD's Authoritative Implementation Contract is the final authority for conflicting product requirements.
- The product is local-first. Local capture, confirmation, printing, and retrieval continue without internet; cloud publishing is asynchronous.
- The printed QR is always `https://myphotobooth.com/:id`. The captive site extracts the ID locally and never relies on split DNS.
- Public output IDs are seven-character cryptographically random base-62 values. Internal IDs and local paths are never public.
- Fastify owns PostgreSQL, workflow enforcement, storage paths, media validation, rendering, printing, and publication coordination.

## Update Template

```md
- YYYY-MM-DD: Confirmed fact. Source: `path`, issue, or decision.
```
