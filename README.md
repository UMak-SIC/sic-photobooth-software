# SIC Photobooth Software

Local-first photobooth platform with a Fastify backend, a Vite booth UI, and two Next.js retrieval sites.

## Prerequisites

- Node.js `26.8.1` was used to verify this workspace.
- pnpm `11.3.0`.

Enable the pinned pnpm version if needed:

```bash
corepack enable
```

## Setup

Install all workspace dependencies from the repository root:

```bash
pnpm install
```

The root `pnpm-workspace.yaml` owns the single `pnpm-lock.yaml` and shared package store. Do not run installs inside an individual `app/` directory.

## Development

Run each application from the repository root in a separate terminal:

```bash
pnpm --filter backend dev
pnpm --filter photobooth-software dev
pnpm --filter captive-website dev
pnpm --filter public-website dev
```

| Application         | URL                     | Purpose                                         |
| ------------------- | ----------------------- | ----------------------------------------------- |
| Fastify backend     | `http://127.0.0.1:3000` | Local API. Health check: `/health`.             |
| Photobooth software | `http://127.0.0.1:5173` | Local booth interface.                          |
| Captive website     | `http://127.0.0.1:5174` | Local guest retrieval site.                     |
| Public website      | `http://127.0.0.1:3001` | Public retrieval site during local development. |

The public Next.js app uses port `3001` so it can run alongside the backend on port `3000`.

## Verification

Type-check and build all four applications:

```bash
pnpm -r typecheck
pnpm -r build
```

Verify the backend after starting it:

```bash
curl http://127.0.0.1:3000/health
```

Expected response:

```json
{ "status": "ok" }
```

## Shared Code

- `packages/public-output/` will own shared public-ID parsing, validation, and retrieval types.
- Create `packages/ui/` only for components that are unchanged between the captive and public retrieval sites.
- The booth has separate workflow UI and should not consume retrieval-only components by default.
