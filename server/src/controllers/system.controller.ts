import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { SAMPLE_PROMPTS } from '../data/samplePrompts.js';
import { prisma } from '../lib/prisma.js';
import { getAuthUser } from '../middleware/auth.js';
import { getAIStatus } from '../services/ai/aiService.js';
import { getDashboardSummary, getRecommendationsOverview } from '../services/dashboard.service.js';
import { isJwtSecretPersistent } from '../services/secret.service.js';
import { SCANNERS } from '../scanners/SecurityScanner.js';
import { CATEGORY_WEIGHTS, SCORE_BANDS } from '../config/scoring.js';
import { sendError, sendSuccess } from '../utils/apiResponse.js';

export async function dashboardSummary(req: Request, res: Response) {
  sendSuccess(res, await getDashboardSummary(getAuthUser(req).id));
}

export async function recommendations(req: Request, res: Response) {
  sendSuccess(res, await getRecommendationsOverview(getAuthUser(req).id));
}

/**
 * Whether accounts and sign-ins survive a server restart. "temporary" means no database is
 * connected on a serverless host (Vercel), so data resets when a new instance starts.
 */
function deploymentStatus() {
  return {
    storage: env.database.temporary ? ('temporary' as const) : ('persistent' as const),
    sessions: isJwtSecretPersistent() ? ('persistent' as const) : ('temporary' as const),
  };
}

export async function health(_req: Request, res: Response) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    sendSuccess(res, { status: 'ok', database: 'ok', ...deploymentStatus(), uptimeSeconds: Math.round(process.uptime()) });
  } catch {
    sendError(res, 503, 'DATABASE_UNAVAILABLE', 'The database is not reachable. Run `npm run setup` to initialise it.');
  }
}

/** Public, non-sensitive configuration: analysis mode, scanners and scoring model. */
export function systemStatus(_req: Request, res: Response) {
  sendSuccess(res, {
    analysisMode: getAIStatus(),
    scanners: SCANNERS.map((s) => ({ category: s.category, label: s.label, stage: s.stage })),
    scoring: { weights: CATEGORY_WEIGHTS, bands: SCORE_BANDS },
    deployment: deploymentStatus(),
    version: '1.0.0',
  });
}

export function samples(_req: Request, res: Response) {
  sendSuccess(res, SAMPLE_PROMPTS);
}
