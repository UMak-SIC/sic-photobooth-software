import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CoreRepository, DatabaseProvider, OutputItem } from '../../src/db/contracts.js';
import { createSqliteProvider } from '../../src/db/provider.js';

/** Unique temporary SQLite databases with guaranteed cleanup via `cleanup()`. */
export function temporaryDatabases() {
  const directories: string[] = [];
  const providers: DatabaseProvider[] = [];
  return {
    path(): string {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-sqlite-repo-'));
      directories.push(directory);
      return path.join(directory, 'photobooth.sqlite');
    },
    async open(filename: string = this.path()): Promise<DatabaseProvider> {
      const provider = createSqliteProvider(filename);
      providers.push(provider);
      await provider.migrate();
      return provider;
    },
    async cleanup(): Promise<void> {
      for (const provider of providers.splice(0)) await provider.close().catch(() => {});
      for (const directory of directories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

let publicIdCounter = 0;
/** Deterministic, unique seven-character public IDs for fixtures. */
export const nextPublicId = (): string => `T${(publicIdCounter++).toString(36).padStart(6, '0')}`;

/** Creates an event + booth-confirmed session with one generated output. */
export async function seedConfirmedOutput(
  repository: CoreRepository,
  options: { mediaType?: 'image/png' | 'image/gif'; publicId?: string } = {},
): Promise<{ sessionId: string; output: OutputItem }> {
  const event = await repository.getOrCreateEvent('Fixture Event', '2026-10-16', 'Fixture Operator');
  const session = await repository.createSession(event.id, 'photo_strip', `token-${nextPublicId()}`);
  const publicId = options.publicId ?? nextPublicId();
  await repository.saveGeneratedOutput(
    session.id,
    publicId,
    options.mediaType ?? 'image/png',
    `outputs/${publicId}.png`,
    1200,
    1800,
  );
  const output = await repository.getOutputByPublicId(publicId);
  return { sessionId: session.id, output: output! };
}
