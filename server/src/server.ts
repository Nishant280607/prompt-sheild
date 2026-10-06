import { createApp } from './createApp.js';
import { env } from './config/env.js';
import { prepareDatabase } from './db/bootstrap.js';
import { prisma } from './lib/prisma.js';
import { getAIStatus } from './services/ai/aiService.js';
import { logger } from './utils/logger.js';

async function main() {
  await prepareDatabase({ serverless: false });

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    const mode = getAIStatus();
    logger.info(
      `Prompt Shield API listening on http://localhost:${env.PORT} - Analysis Mode: ${mode.label}${mode.model ? ` (${mode.provider}: ${mode.model})` : ''}`,
    );
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received - shutting down`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/no such table|does not exist/i.test(message)) {
    logger.error('The database is missing tables. Run `npm run setup` (or `npm run db:deploy`) first.');
  } else {
    logger.error('Failed to start the server', error);
  }
  await prisma.$disconnect();
  process.exit(1);
});
