# Legacy PostgreSQL schema (non-executable evidence)

The backend ran on PostgreSQL until the SQLite cutover. These files are kept as evidence only. Nothing in the application runs them, and the build does not copy them into `dist`.

- `migrations/001`–`010`: the PostgreSQL migrations exactly as applied in production. Do not edit them. The legacy importer (`scripts/database/lib/import-catalog.ts`) checksums them to verify a restored database's `schema_migrations` ledger. The live ledger also records `011_storage_relative_paths.sql`, which was deleted before cutover and is allowlisted by checksum there.
- `schema.sql`: a stale schema snapshot. It was never the source of truth, and the SQLite baseline was not derived from it.

The SQLite schema lives in `src/db/sqlite/migrations/`.
