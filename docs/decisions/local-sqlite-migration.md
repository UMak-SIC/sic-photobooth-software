# Local SQLite Migration Decision

## Status

Approved for implementation; production cutover is pending.

## Decision

The local photobooth metadata store will move from local PostgreSQL to one durable SQLite database. SQLite will remain local to the Fastify backend. Captured and generated media remain in backend-controlled filesystem storage; SQLite stores only metadata and paths.

Until the cutover validation hold is explicitly removed, PostgreSQL remains the sole production write authority. The runtime must never dual-write. A configured engine selector is permitted only while PostgreSQL is the default and SQLite is used for development, tests, or rehearsals.

## Migration safety boundary

1. A checksummed PostgreSQL custom-format dump and storage manifest must exist in two protected failure domains.
2. That exact dump must be restored into a disposable PostgreSQL database and pass the recorded catalog, migration-ledger, inventory, relationship, queue-state, and media-manifest checks.
3. The final production import must pass the PostgreSQL-to-SQLite parity gate while the booth is closed to writes.
4. PostgreSQL rollback is permitted only before SQLite mutation routes and workers are enabled.
5. Once SQLite accepts production writes, PostgreSQL is stale. Recovery is SQLite restore or repair-forward; a reverse migration needs separate approval.

## Consequences

- No client receives direct database access.
- Existing public IDs, session tokens, API response shapes, workflow rules, and print/publication semantics are preserved.
- SQLite backup uses the online backup API or `VACUUM INTO`; copying a live WAL database file is prohibited.
- PostgreSQL dumps, the legacy deployment artifact, the cutover tag, and operator runbooks are retained according to the approved retention policy.
