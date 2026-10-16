import { config } from '../config.js';
import { closeDatabaseProvider, runDatabaseMigrations } from './provider.js';

async function main() {
  console.log(`🚀 Running ${config.localDatabaseEngine} database migrations...`);
  try {
    const summary = await runDatabaseMigrations();
    if (summary.applied.length > 0) {
      console.log(`✅ Successfully applied ${summary.applied.length} migration(s):`);
      for (const m of summary.applied) {
        console.log(`   - ${m}`);
      }
    } else {
      console.log(`✨ Database is up to date (total ${summary.total} migrations).`);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await closeDatabaseProvider();
  }
}

main();
