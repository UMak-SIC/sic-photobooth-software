import { runMigrations } from './migrations.js';
import { pool } from './pool.js';

async function main() {
  console.log('🚀 Running database migrations...');
  try {
    const summary = await runMigrations();
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
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
