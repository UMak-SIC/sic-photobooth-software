#!/usr/bin/env bash
# Ports a verified legacy PostgreSQL backup set into a new versioned SQLite file.
#
#   pnpm --filter @photobooth/backend db:port-legacy-backup -- <backup-dir> <destination-dir>
#
# The backup set is only read, so this can be rerun any number of times. The dump is
# restored into a throwaway PostgreSQL cluster (Unix socket only, no TCP) that is
# deleted on exit; the live booth database is never contacted. Each run writes a new
# photobooth-<backup>-<run>.sqlite plus its import summary, parity report, and cutover
# validation result. Switching the booth to the file is a separate operator step
# (docs/runbooks/postgres-to-sqlite-cutover.md).
set -euo pipefail

usage() {
  echo "Usage: port-legacy-backup.sh <backup-dir> <destination-dir>" >&2
  exit 2
}
[[ "${1:-}" == "--" ]] && shift # pnpm forwards a literal separator
[[ $# -eq 2 ]] || usage
backup_dir=$(realpath -e "$1")
mkdir -p "$2"
dest_dir=$(realpath -e "$2")
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
backend_dir=$(cd "$script_dir/../.." && pwd)

for required in photobooth.dump photobooth.dump.sha256 storage-manifest.sha256 storage; do
  [[ -e "$backup_dir/$required" ]] || { echo "Backup set is missing $required." >&2; exit 1; }
done
for tool in initdb pg_ctl pg_restore createdb sha256sum; do
  command -v "$tool" >/dev/null || { echo "$tool is required." >&2; exit 1; }
done

echo "Verifying backup checksums..."
(cd "$backup_dir" && sha256sum -c --quiet photobooth.dump.sha256)
(cd "$backup_dir/storage" && sha256sum -c --quiet ../storage-manifest.sha256)

backup_name=$(basename "$backup_dir")
run_stamp=$(date -u +%Y%m%dT%H%M%SZ)
base="$dest_dir/photobooth-$backup_name-$run_stamp"
[[ ! -e "$base.sqlite" ]] || { echo "$base.sqlite already exists." >&2; exit 1; }

cluster=$(mktemp -d)
port=$((50000 + RANDOM % 10000))
cleanup() {
  pg_ctl -D "$cluster/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$cluster"
}
trap cleanup EXIT

echo "Restoring the dump into a throwaway cluster..."
initdb -D "$cluster/data" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$cluster/data" -o "-p $port -k $cluster -c listen_addresses=''" \
  -l "$cluster/postgres.log" -w start >/dev/null
restore_db="photobooth_restore_${backup_name}"
createdb -h "$cluster" -p "$port" -U postgres "$restore_db"
pg_restore -h "$cluster" -p "$port" -U postgres --exit-on-error --no-owner --no-privileges \
  -d "$restore_db" "$backup_dir/photobooth.dump"
source_url="postgresql://postgres@localhost:$port/$restore_db?host=$cluster"

accept_args=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  accept_args+=(--accept-missing-media "$line")
done < "$script_dir/legacy-known-missing-media.txt"

umask 077
cd "$backend_dir"
echo "Importing..."
pnpm --silent exec tsx scripts/database/import-legacy-postgres.ts \
  --source-url "$source_url" --destination "$base.sqlite" --summary "$base.import.json" >/dev/null
echo "Validating parity (rows, aggregates, and every referenced image)..."
pnpm --silent exec tsx scripts/database/validate-postgres-sqlite-parity.ts \
  --source-url "$source_url" --sqlite "$base.sqlite" --report "$base.parity.json" \
  --media-manifest "$backup_dir/storage-manifest.sha256" --storage-root "$backup_dir/storage" \
  --verify-media-files "${accept_args[@]}"
echo "Validating the cutover candidate..."
pnpm --silent exec tsx scripts/database/validate-cutover-candidate.ts \
  --candidate "$base.sqlite" --parity-report "$base.parity.json" > "$base.cutover.json"

echo "Ported $backup_name to $base.sqlite"
echo "Reports: $base.import.json, $base.parity.json, $base.cutover.json"
