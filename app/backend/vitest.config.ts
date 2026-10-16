import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Isolates every test file on a temporary SQLite database; never a real PostgreSQL.
    setupFiles: ['test/setup/isolated-database.ts'],
  },
});
