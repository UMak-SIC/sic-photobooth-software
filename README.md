# SIC Photobooth Software

Local-first photobooth platform with a Fastify backend, a Vite booth UI, and two Next.js retrieval sites. The backend keeps all booth data in a local SQLite database and media files under its storage directory.

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

## Delivery Architecture

The booth stays usable without internet. Confirmation saves the final PNG or GIF locally and enqueues a publication job. When the worker detects that the public application is online, it uploads the asset to Cloudinary, upserts its delivery metadata in Supabase, and then marks the local job uploaded.

Cloudinary and Supabase must both succeed before the output is considered published. Failed jobs use bounded exponential backoff with jitter, dead-letter after five attempts, and remain manually retryable from the booth dashboard.

Supabase owns public metadata and retention. Its hourly cron invokes an Edge Function that deletes an expired Cloudinary asset before removing its Supabase record. It never deletes local booth media.

## Local Backend Environment

Create `app/backend/.env`. Do not commit it.

```dotenv
# Server and local persistence
PORT=3000
HOST=0.0.0.0
SQLITE_DATABASE_PATH=/absolute/path/to/photobooth-storage/database/photobooth.sqlite
STORAGE_DIR=/absolute/path/to/photobooth-storage
NODE_ENV=development

# Cutover hold: when 1, write requests return 503 and the publishing and print
# workers do not start. Keep 0 for normal operation.
DATABASE_CUTOVER_HOLD=0

# Required in production. The worker resolves this host before attempting uploads.
PUBLIC_APP_URL=https://umak-sic-photobooth.vercel.app

# Server-only Cloudinary credentials. Use a signed Upload API account, not an unsigned preset.
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Server-only Supabase credentials.
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`CLOUDINARY_API_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must never be sent to a browser or placed in a `NEXT_PUBLIC_*` variable. In production, an absent `PUBLIC_APP_URL` pauses publishing instead of failing open.

Without `SQLITE_DATABASE_PATH` and `STORAGE_DIR`, the backend uses `app/storage/database/photobooth.sqlite` and `app/storage/`. The backend reads `.env` from its working directory, so start it from `app/backend` (as `start.sh` and `pnpm --filter` do). Use an absolute `SQLITE_DATABASE_PATH` so the file never depends on where the process starts.

The backend applies pending SQLite migrations at startup. To apply them without starting the server:

```bash
pnpm --filter @photobooth/backend db:migrate
```

## Running the Booth

`./start.sh` is the booth launcher. It requires `kitty`, `npm`, `curl`, and `systemctl`, opens three Kitty windows, waits for each service, and prints a health summary:

| Window | Runs |
| --- | --- |
| SIC Infrastructure | `sudo systemctl start` for CUPS, Caddy, and the installed `sic-photobooth*hotspot.service` (install it first with `config/captive-portal/install.sh`). Stops the hotspot and Caddy on exit. |
| SIC API and Captive | The backend (`app/backend`, `dev`) and the captive website (production build and start). |
| SIC Booth App | The booth interface (`app/photobooth-software`, `dev`). |

Each mode can also run on its own: `./start.sh infrastructure`, `./start.sh services`, or `./start.sh booth`.

## Development

Run each application from the repository root in a separate terminal:

```bash
pnpm --filter @photobooth/backend dev
pnpm --filter photobooth-software dev
pnpm --filter captive-website dev
pnpm --filter public-website dev
```

| Application | URL | Purpose |
| --- | --- | --- |
| Fastify backend | `http://127.0.0.1:3000` | Local API. Health check: `/health`. |
| Photobooth software | `http://127.0.0.1:5173` | Local booth interface. |
| Captive website | `http://127.0.0.1:5174` | Local guest retrieval site. |
| Public website | `http://127.0.0.1:3002` | Public retrieval site during local development. |

The public Next.js app uses port `3002` so it can run alongside the backend on port `3000`.

## Local Database

The backend owns one SQLite file, opened in WAL mode with foreign keys enforced. Only one backend process may use it at a time.

- **Startup:** the backend runs migrations and a health check before listening, and exits with status 1 if either fails. Run it under a supervisor that restarts it on failure.
- **Cutover hold:** with `DATABASE_CUTOVER_HOLD=1`, every request other than GET, HEAD, or OPTIONS returns `503 MAINTENANCE_HOLD` and neither worker starts, while health, reads, and local retrieval keep working. The value is read at startup, so changing it needs a restart.
- **Never swap database files while the backend or a worker is running.**

Database commands, run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm --filter @photobooth/backend db:backup -- --dest <dir>` | Online, WAL-safe backup with a `.sha256` file; every backup is verified. `--keep <n>` prunes older backups it created. |
| `pnpm --filter @photobooth/backend db:verify-backup -- <file>` | Checks the checksum, integrity, foreign keys, and migration ledger, then test-restores to a temporary directory. |
| `pnpm --filter @photobooth/backend db:port-legacy-backup -- <backup-dir> <dest-dir>` | Rebuilds a new versioned SQLite file from a legacy PostgreSQL backup set. The backup is only read, so this can be rerun at any time. |
| `pnpm --filter @photobooth/backend db:validate-cutover -- --candidate <file> --parity-report <report.json>` | Read-only validation of a candidate SQLite file before the booth is pointed at it. |

These commands run through `tsx`, so install development dependencies (a plain `pnpm install`, not `--prod`) wherever they are used. Pass absolute paths: `pnpm --filter` runs them from `app/backend`.

### Legacy PostgreSQL Data

The booth ran on PostgreSQL until October 2026. Its final backup set (`photobooth.dump`, `photobooth.dump.sha256`, `storage-manifest.sha256`, and a full `storage/` copy) is kept outside the repository. `db:port-legacy-backup` verifies the dump and every media checksum, restores the dump into a throwaway PostgreSQL cluster reachable only through a Unix socket, imports it, and runs the row-by-row and media parity gate. Restoring the dump requires the PostgreSQL client and server binaries (`initdb`, `pg_ctl`, `pg_restore`); the booth itself no longer runs PostgreSQL.

See `app/backend/scripts/database/README.md` for the import and parity details, `docs/runbooks/postgres-to-sqlite-cutover.md` for the cutover procedure, and `docs/runbooks/sqlite-backup-and-restore.md` for scheduling, retention, and restore.

## Supabase Deployment

The Supabase migration creates:

- `public.public_outputs` for published delivery metadata.
- RLS allowing public reads only while an output has not expired.
- A hashed-IP, 30-request-per-minute public lookup limiter.
- Hourly cleanup of stale lookup buckets.
- An hourly `pg_cron` job that invokes the retention Edge Function.

Install and authenticate the Supabase CLI, link the production project, apply the migration, and deploy the function:

```bash
pnpm dlx supabase@latest init
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase@latest db push
pnpm dlx supabase@latest functions deploy expire-public-outputs
```

Add the Vault secrets used by the cron job in the Supabase SQL editor. Generate `public_output_cron_secret` with a long random value.

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY', 'publishable_key');
select vault.create_secret('A_LONG_RANDOM_VALUE', 'public_output_cron_secret');
```

Configure the matching Edge Function secrets without committing them:

```bash
pnpm dlx supabase@latest secrets set \
  CLOUDINARY_CLOUD_NAME=your-cloud-name \
  CLOUDINARY_API_KEY=your-api-key \
  CLOUDINARY_API_SECRET=your-api-secret \
  PUBLIC_OUTPUT_CRON_SECRET=the-same-long-random-value
```

`x-cron-secret` is the private request header between Supabase cron and the Edge Function. It prevents arbitrary callers from triggering Cloudinary deletion even if they know the function URL.

## Vercel Public Website Deployment

Create a Vercel project from this repository with `app/public-website` as the Root Directory. In **Root Directory** settings, enable **Include source files outside of the Root Directory in the Build Step** so Vercel can link `packages/public-output`. The committed `app/public-website/vercel.json` installs from the workspace root and builds that shared package before Next.js. Use the Production environment for the following values:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project URL used for public-output reads. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Supabase publishable key used for RLS-protected output reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Used only by the server-rendered `/:id` route to consume a lookup-rate-limit token. |

Never use `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Any variable prefixed `NEXT_PUBLIC_` is included in browser JavaScript.

The Vercel public route is `https://umak-sic-photobooth.vercel.app/:id`; it validates the seven-character base-62 ID, consumes a shared rate-limit token, then looks up the finalized Supabase record. Unpublished, expired, deleted, malformed, or rate-limited IDs return the standard unavailable page.

## Deployment Order

1. Provision Cloudinary and copy its signed Upload API credentials to the backend and retention Edge Function.
2. Provision Supabase, apply the migration, configure Vault and Edge Function secrets, and deploy `expire-public-outputs`.
3. Configure the local booth backend environment and run its SQLite migrations (`pnpm --filter @photobooth/backend db:migrate`). Run the backend under a supervisor that restarts it on failure; it exits if the database is unhealthy.
4. Deploy the public Next.js app to Vercel with its two public variables and server-only service-role variable.
5. Set `PUBLIC_APP_URL=https://umak-sic-photobooth.vercel.app` on the booth.
6. Confirm a new output appears as `uploaded` in the booth dashboard and resolves at `https://umak-sic-photobooth.vercel.app/:id`.

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

A healthy backend returns HTTP 200:

```json
{"status":"healthy","timestamp":"…","uptimeSeconds":12,"services":{"database":"connected","storage":"writable"}}
```

Run the backend tests. Each test file gets its own temporary SQLite database and storage directory, and the config refuses the booth's default database and storage under test:

```bash
pnpm --filter @photobooth/backend exec vitest run
pnpm --filter @photobooth/backend typecheck:scripts
```

Verify the full local implementation before deployment:

```bash
pnpm --filter @photobooth/backend typecheck
pnpm --filter @photobooth/backend build
pnpm --filter public-website build
pnpm exec vitest run app/backend/test/publishing-worker.test.ts
deno check supabase/functions/expire-public-outputs/index.ts
```

With `supabase start` running for this repository, run the real Supabase integration test. It validates the publication upsert, anonymous RLS lookup, and the 30-request lookup cap against the local stack:

```bash
eval "$(pnpm dlx supabase@latest status --output env)"
SUPABASE_INTEGRATION_URL="$API_URL" \
SUPABASE_INTEGRATION_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
SUPABASE_INTEGRATION_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
pnpm --filter @photobooth/backend test:integration
```

## Shared Code

- `packages/public-output/` will own shared public-ID parsing, validation, and retrieval types.
- Create `packages/ui/` only for components that are unchanged between the captive and public retrieval sites.
- The booth has separate workflow UI and should not consume retrieval-only components by default.
