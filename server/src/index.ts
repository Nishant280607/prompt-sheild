import express, { type Express, type Response } from 'express';
import { logger } from './utils/logger.js';

/**
 * Serverless entrypoint used by Vercel (see vercel.json). Vercel runs the API as a function and
 * hands every request to this default-exported Express app - there is no `app.listen()` and no
 * setup step, so each new instance prepares the database (migrations + demo account) first.
 *
 * The API itself is imported lazily, so start-up problems (for example a missing or weak
 * setting) reach the browser as a readable JSON error instead of Vercel's bare
 * "FUNCTION_INVOCATION_FAILED" page, and GET /api/health/live can report them.
 *
 * Note: Vercel picks the first of dist/app.js, dist/index.js, dist/server.js as the handler,
 * which is why the Express app lives in createApp.ts and the local server in server.ts.
 */
type StartupStep = 'loading' | 'database' | 'ready';

interface StartupState {
  status: 'starting' | 'ready' | 'failed';
  step: StartupStep;
  /** Error class and code only (plus the text of configuration errors) - never stack traces. */
  error?: { step: StartupStep; name: string; code?: string; message?: string };
}

const state: StartupState = { status: 'starting', step: 'loading' };
let ready: Promise<Express> | undefined;

async function start(): Promise<Express> {
  state.status = 'starting';
  state.step = 'loading';
  delete state.error;
  const [{ createApp }, { prepareDatabase }] = await Promise.all([
    import('./createApp.js'),
    import('./db/bootstrap.js'),
  ]);
  state.step = 'database';
  await prepareDatabase({ serverless: true });
  const api = createApp();
  state.status = 'ready';
  state.step = 'ready';
  return api;
}

function describe(error: unknown, step: StartupStep): NonNullable<StartupState['error']> {
  const name = error instanceof Error ? error.name : 'Error';
  const rawCode = (error as { code?: unknown } | null)?.code;
  const code =
    typeof rawCode === 'string' && /^[A-Z0-9_]{2,40}$/i.test(rawCode) ? rawCode : undefined;
  const message = name === 'ConfigError' && error instanceof Error ? error.message : undefined;
  return { step, name, ...(code ? { code } : {}), ...(message ? { message } : {}) };
}

function launch(): Promise<Express> {
  const attempt = start();
  attempt.catch((error: unknown) => {
    state.status = 'failed';
    state.error = describe(error, state.step);
    ready = undefined; // try again on the next request (e.g. after a temporary database outage)
    logger.error('Prompt Shield API failed to start', error);
  });
  return attempt;
}

function sendStartupError(res: Response) {
  const configError = state.error?.name === 'ConfigError' ? state.error.message : undefined;
  const message = configError
    ? `Server configuration error: ${configError}`
    : 'The server could not prepare its database. Check DATABASE_URL and DATABASE_AUTH_TOKEN, then try again.';
  res
    .status(503)
    .set('Cache-Control', 'no-store')
    .json({ success: false, error: { code: 'SERVER_NOT_READY', message } });
}

const app = express();
app.disable('x-powered-by');

/** Liveness: answers without the database, and says whether start-up worked (and where it failed). */
app.get('/api/health/live', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    success: true,
    data: {
      status: 'alive',
      startup: state.status,
      ...(state.error ? { error: state.error } : {}),
    },
  });
});

app.use(async (req, res, next) => {
  let api: Express;
  try {
    ready ??= launch();
    api = await ready;
  } catch {
    sendStartupError(res);
    return;
  }
  api(req, res, next);
});

// Warm up as soon as the instance starts instead of on the first request.
ready = launch();

export default app;
