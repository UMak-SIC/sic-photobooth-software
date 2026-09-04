# Contributing

## Start Here

1. Read [AGENTS.md](AGENTS.md) and [agents/README.md](agents/README.md).
2. Read [docs/PRD.md](docs/PRD.md) before changing product behavior. Its Authoritative Implementation Contract wins conflicts.
3. Read [docs/system-architecture.md](docs/system-architecture.md) before changing QR retrieval or publishing behavior.
4. Read the relevant file under `agents/` before editing that area.

## Architecture Rules

- Preserve local-first behavior: capture, confirmation, printing, and local retrieval must work without internet access.
- Treat every client as untrusted. Enforce workflow state, session isolation, media validation, and generated storage paths in `app/backend/`.
- `app/backend/` is the only application with PostgreSQL and local filesystem authority.
- `app/photobooth-software/` uses backend APIs for persisted work and must not write arbitrary local files.
- `app/captive-website/` provides guest-safe local retrieval only. It extracts the ID from the printed public URL; it must not navigate to it or expose booth controls.
- `app/public-website/` resolves public IDs through Supabase and Cloudinary. It must never contact the local backend.
- Put shared public-ID parsing, validation, and public-output types in `packages/public-output/`.
- Put a component in `packages/ui/` only when both retrieval websites use it unchanged.
- Public output IDs are seven-character, cryptographically random base-62 values. Never expose sequential IDs or local filesystem paths.
- Printed QR codes always contain `https://myphotobooth.com/:id`. Do not introduce split DNS.
- Keep cloud publishing asynchronous; it must not block booth confirmation.

## Make Changes

- Prefer the smallest correct change and existing local patterns over new abstractions or dependencies.
- Keep domain rules in the backend, not React or Next.js clients.
- Do not pre-create empty components or modules for future work.
- Update `agents/sitemap.md` or `agents/component-breakdowns.md` when a route or ownership boundary changes.
- Add a regression entry only after confirming both the defect and its prevention.
- Record only confirmed, durable facts in `agents/memory.md`.

## Tests And Checks

This repository is currently scaffold-only and has no package manifest, test runner, formatter, linter, or CI configuration. Do not invent commands or tooling.

When tooling exists, add the smallest behavior-focused test for non-trivial logic. Use [agents/unit-tests.md](agents/unit-tests.md) and [agents/e2e-tests.md](agents/e2e-tests.md) as coverage reminders.

## Pull Requests

- Keep PRs small and focused. Aim for fewer than 200 changed lines; around 50 is ideal.
- Use stacked PRs for dependent work and parallel branches only for independent work.
- Complete the pull request template. It should let a reviewer follow the change without rediscovering its intent, flow, files, or integrations.
- State tests run, manual verification, and checks not run with the reason.
- Call out changed contracts, migrations, rollout concerns, and explicit non-goals.

## Commit Messages

Use a concise conventional prefix, such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`.
