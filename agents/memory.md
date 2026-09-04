# Agent Memory

## === What's Here ===

Confirmed, durable knowledge that helps future agents make correct changes. Do not add temporary work status, secrets, credentials, guesses, or duplicated PRD prose.

## Current Facts

- The monorepo is scaffold-only: no package manifests, scripts, lockfiles, CI, test runner, linter, or formatter are present yet.
- The PRD's Authoritative Implementation Contract is the final authority for conflicting product requirements.
- The product is local-first. Local capture, confirmation, printing, and retrieval continue without internet; cloud publishing is asynchronous.
- The printed QR is always `https://myphotobooth.com/:id`. The captive site extracts the ID locally and never relies on split DNS.
- Public output IDs are seven-character cryptographically random base-62 values. Internal IDs and local paths are never public.
- Fastify owns PostgreSQL, workflow enforcement, storage paths, media validation, rendering, printing, and publication coordination.

## Update Template

```md
- YYYY-MM-DD: Confirmed fact. Source: `path`, issue, or decision.
```
