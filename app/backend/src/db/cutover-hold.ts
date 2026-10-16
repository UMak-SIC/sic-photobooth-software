import { config, type AppConfig } from '../config.js';

/**
 * True while the operator holds the booth closed for the PostgreSQL-to-SQLite
 * cutover validation. Mutation routes and both workers must stay disabled.
 */
export function isCutoverHoldActive(
  source: Pick<AppConfig, 'databaseCutoverHold'> = config,
): boolean {
  return source.databaseCutoverHold;
}
