import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { logger } from './utils/logger.js';

/**
 * Serverless entrypoint used by Vercel (see vercel.json). Vercel calls this default export for
 * every request - there is no `app.listen()` and no setup step, so the first request on a new
 * instance prepares the database (migrations + demo account) before the API answers.
 *
 * Everything is imported lazily so that start-up problems (for example a missing or weak
 * setting) reach the browser as a readable JSON error instead of Vercel's bare
 * "FUNCTION_INVOCATION_FAILED" page.
 *
 * Note: Vercel picks the first of dist/app.js, dist/index.js, dist/server.js as the handler,
 * which is why the Express app lives in createApp.ts and the local server in server.ts.
 */
let ready: Promise<RequestListener> | undefined;

async function start(): Promise<RequestListener> {
  const [{ createApp }, { prepareDatabase }] = await Promise.all([
    import('./createApp.js'),
    import('./db/bootstrap.js'),
  ]);
  await prepareDatabase({ serverless: true });
  return createApp();
}

function sendStartupError(res: ServerResponse, error: unknown) {
  const isConfigError = error instanceof Error && error.name === 'ConfigError';
  const message = isConfigError
    ? `Server configuration error: ${error.message}`
    : 'The server could not prepare its database. Check DATABASE_URL and DATABASE_AUTH_TOKEN, then try again.';
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ success: false, error: { code: 'SERVER_NOT_READY', message } }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: RequestListener;
  try {
    ready ??= start();
    app = await ready;
  } catch (error) {
    ready = undefined; // try again on the next request (e.g. after a temporary database outage)
    logger.error('Prompt Shield API failed to start', error);
    sendStartupError(res, error);
    return;
  }
  app(req, res);
}
