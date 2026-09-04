# Repository Guide

## Agent Knowledge Base

- Start with `agents/README.md`. It indexes the project sitemap, component ownership, coding preferences, standards, test reminders, regression log, recovery playbooks, and agent memory.
- Keep those files current when a route, component boundary, test expectation, regression, or durable project decision changes.
- If the knowledge base does not answer the question, consult `docs/`, beginning with `docs/PRD.md` and `docs/system-architecture.md`.

## Current State

- This is a scaffold-only monorepo. There are no package manifests, scripts, lockfiles, CI workflows, test runners, or formatter/linter configuration yet; do not invent commands or assume a package manager.
- `docs/PRD.md` is the product contract. Its **Authoritative Implementation Contract** section takes precedence when it conflicts with earlier PRD text.
- `docs/system-architecture.md` defines the shared-QR offline/online retrieval model.

## Application Boundaries

- `app/backend/` will be the local Fastify source of truth: PostgreSQL access, session/workflow enforcement, media validation, local storage, rendering, printing, and asynchronous publishing. Clients never access PostgreSQL directly.
- `app/photobooth-software/` will be the local React/Vite booth UI. It uses the backend for persisted operations and must not write arbitrary local files.
- `app/captive-website/` will be the local Next.js guest retrieval portal. It parses the ID from the permanent public QR URL and retrieves only local approved outputs through the backend; it must not expose booth controls.
- `app/public-website/` will be the Vercel-hosted Next.js retrieval site. It resolves public IDs through Supabase/Cloudinary and must never contact the local backend.

## Shared Packages

- `packages/public-output/` is for shared public-ID parsing/validation and public-output API types used by both retrieval websites.
- `packages/ui/` is for components that are demonstrably identical in both retrieval websites; keep local-backend and Supabase/Cloudinary clients within their respective apps.

## Non-Negotiable Constraints

- Preserve local-first behavior: booth capture, confirmation, printing, and local retrieval work without internet; cloud publishing is asynchronous.
- Treat clients as untrusted. The backend enforces state transitions, session isolation, retake/media limits, file validation, and generated storage paths.
- Printed QR codes always contain `https://myphotobooth.com/:id`; there is no split DNS. Local retrieval extracts the ID rather than navigating to the public URL.
- Public output IDs are seven-character, cryptographically random base-62 values. Never expose sequential database IDs or local filesystem paths.
