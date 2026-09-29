import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';

const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  skip: () => !env.RATE_LIMIT_ENABLED,
};

/** General API limit (generous enough for progress polling). */
export const apiLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 1000,
  handler: (_req: Request, res: Response) =>
    sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'),
});

/** Brute-force protection for login/registration. Only failed attempts count. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  handler: (_req: Request, res: Response) =>
    sendError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Please try again in 15 minutes.'),
});

/** Limit how many analyses a client can start per minute. */
export const analysisLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 30,
  handler: (_req: Request, res: Response) =>
    sendError(res, 429, 'ANALYSIS_RATE_LIMITED', 'Too many analyses started. Please wait a minute.'),
});
