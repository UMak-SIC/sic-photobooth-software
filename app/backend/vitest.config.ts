import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Isolates every test file on a temporary SQLite database and storage directory.
    setupFiles: ['test/setup/isolated-database.ts'],
  },
});
