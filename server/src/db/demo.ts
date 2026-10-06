import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { SEED_PLAN } from '../data/samplePrompts.js';
import { prisma } from '../lib/prisma.js';
import { resolveProvider } from '../services/ai/aiService.js';
import { executeAnalysis } from '../services/analysis.service.js';
import { isUniqueConstraintError } from '../utils/dbErrors.js';

/**
 * DEVELOPMENT / DEMO DATA.
 * The demo account shown on the login page, with realistic sample prompts and analyses.
 * Every analysis is produced by the real scanning pipeline (Local Analysis Mode); only the
 * timestamps are back-dated so the dashboard trend has history.
 *
 * IDs are fixed, so the demo account (and a signed-in demo session) is identical on every
 * server instance - important on serverless hosts where each instance may have its own
 * temporary database.
 */
export const DEMO_ACCOUNT = {
  id: 'demo-account',
  name: 'Demo Analyst',
  email: 'demo@promptshield.local',
  password: 'Demo@12345',
} as const;

const HOUR = 60 * 60 * 1000;
const daysAgo = (days: number, extraHours = 0) =>
  new Date(Date.now() - days * 24 * HOUR - extraHours * HOUR);

export interface SeedOptions {
  /** Delete and re-create the demo account (used by `npm run db:seed`). */
  reset?: boolean;
  log?: (line: string) => void;
}

/**
 * Make sure the demo account exists. Without `reset`, an existing demo account is left as it
 * is, so this is safe to call on every server start.
 */
export async function seedDemoAccount(options: SeedOptions = {}): Promise<'created' | 'exists'> {
  const log = options.log ?? (() => undefined);

  if (options.reset) {
    await prisma.user.deleteMany({
      where: { OR: [{ email: DEMO_ACCOUNT.email }, { id: DEMO_ACCOUNT.id }] },
    });
  } else if (
    await prisma.user.findUnique({ where: { email: DEMO_ACCOUNT.email }, select: { id: true } })
  ) {
    return 'exists';
  }

  try {
    await prisma.user.create({
      data: {
        id: DEMO_ACCOUNT.id,
        name: DEMO_ACCOUNT.name,
        email: DEMO_ACCOUNT.email,
        passwordHash: await bcrypt.hash(DEMO_ACCOUNT.password, env.BCRYPT_ROUNDS),
      },
    });
  } catch (error) {
    // Another server instance created it at the same moment.
    if (isUniqueConstraintError(error)) return 'exists';
    throw error;
  }

  const local = resolveProvider('local');
  for (const [promptIndex, plan] of SEED_PLAN.entries()) {
    const firstVersion = plan.versions[0];
    if (!firstVersion) continue;
    const promptId = `demo-prompt-${promptIndex + 1}`;
    await prisma.prompt.create({
      data: {
        id: promptId,
        userId: DEMO_ACCOUNT.id,
        title: plan.title,
        category: plan.category,
        description: plan.description,
        createdAt: daysAgo(firstVersion.daysAgo, 3),
      },
    });

    for (const [index, version] of plan.versions.entries()) {
      const versionId = `${promptId}-v${index + 1}`;
      await prisma.promptVersion.create({
        data: {
          id: versionId,
          promptId,
          versionNumber: index + 1,
          content: version.content,
          changeNote: version.changeNote,
          source: 'SEED',
          createdAt: daysAgo(version.daysAgo, 1),
        },
      });
      const analysis = await prisma.analysis.create({
        data: {
          id: `${versionId}-analysis`,
          promptVersionId: versionId,
          status: 'RUNNING',
          mode: 'LOCAL',
          provider: 'local',
          startedAt: new Date(),
        },
      });
      await executeAnalysis(analysis.id, version.content, local);

      const result = await prisma.analysis.findUniqueOrThrow({ where: { id: analysis.id } });
      if (result.status !== 'COMPLETED')
        throw new Error(`Seed analysis failed for "${plan.title}" v${index + 1}`);
      const analysedAt = daysAgo(version.daysAgo);
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          createdAt: analysedAt,
          startedAt: analysedAt,
          completedAt: new Date(analysedAt.getTime() + (result.durationMs ?? 25)),
        },
      });
      log(`  - ${plan.title} v${index + 1}: score ${result.overallScore} (${result.riskLevel})`);
    }

    const lastVersion = plan.versions.at(-1) ?? firstVersion;
    await prisma.prompt.update({
      where: { id: promptId },
      data: { updatedAt: daysAgo(lastVersion.daysAgo) },
    });
  }
  return 'created';
}
