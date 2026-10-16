import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('SQLite-only runtime', () => {
  // pg stays a devDependency only for the legacy import/parity scripts under scripts/.
  it('never imports pg or reads DATABASE_URL from application code', () => {
    const offenders = sourceFiles(path.join(backend, 'src')).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return /from\s+['"]pg['"]|require\(['"]pg['"]\)|DATABASE_URL|LOCAL_DATABASE_ENGINE/.test(
        text,
      );
    });
    expect(offenders.map((file) => path.relative(backend, file))).toEqual([]);
  });

  it('keeps pg out of the production dependencies', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
    expect(manifest.dependencies).not.toHaveProperty('pg');
    expect(manifest.dependencies).not.toHaveProperty('@types/pg');
    expect(manifest.devDependencies).toHaveProperty('pg');
  });

  it('keeps the legacy PostgreSQL migrations out of the build', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
    expect(manifest.scripts.build).toContain('src/db/sqlite/migrations');
    expect(manifest.scripts.build).not.toMatch(/legacy-postgres|src\/db\/migrations|schema\.sql/);
    expect(fs.existsSync(path.join(backend, 'src/db/migrations'))).toBe(false);
  });
});
