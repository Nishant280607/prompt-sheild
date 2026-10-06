import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import apiRouter from './routes/index.js';

/** Build the Express application (exported separately so tests can use it without listening). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Vercel's proxy the client IP is in X-Forwarded-For; rate limits must key on it,
  // not on the proxy's address (which would put every visitor in the same bucket).
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server) are allowed.
        callback(null, !origin || env.clientOrigins.includes(origin));
      },
      exposedHeaders: ['Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', apiLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
