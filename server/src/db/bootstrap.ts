import { env } from '../config/env.js';
import { MIGRATIONS } from '../generated/migrations.js';
import { recoverInterruptedAnalyses } from '../services/analysis.service.js';
import { logger } from '../utils/logger.js';
import { seedDemoAccount } from './demo.js';
import { applyMigrations } from './migrate.js';

/** Analyses still "running" after this long on a serverless host were cut off by a restart. */
const SERVERLESS_STALE_ANALYSIS_MS = 10 * 60 * 1000;

/**
 * Everything the database needs before the API serves requests:
 * 1. apply pending migrations (a new database gets its tables),
 * 2. create the demo account when DEMO_ACCOUNT is enabled (default),
 * 3. mark analyses interrupted by a restart as failed.
 */
export async function prepareDatabase(options: { serverless?: boolean } = {}): Promise<void> {
  const serverless = options.serverless ?? env.isServerless;

  const migrations = await applyMigrations(env.database, MIGRATIONS);
  if (migrations.applied.length > 0)
    logger.info(`Applied database migration(s): ${migrations.applied.join(', ')}`);
  if (migrations.skipped)
    logger.warn('Database tables exist without migration history - automatic migrations skipped.');

  if (env.DEMO_ACCOUNT) {
    const started = Date.now();
    if ((await seedDemoAccount()) === 'created') {
      logger.info(`Demo account created (demo@promptshield.local) in ${Date.now() - started} ms.`);
    }
  }

  // A single local server owns every running analysis, so all of them were interrupted. Serverless
  // instances share a database (Turso), so only analyses that stopped making progress are failed.
  const recovered = await recoverInterruptedAnalyses(
    serverless ? new Date(Date.now() - SERVERLESS_STALE_ANALYSIS_MS) : undefined,
  );
  if (recovered > 0) logger.warn(`Marked ${recovered} interrupted analysis run(s) as failed.`);
}
