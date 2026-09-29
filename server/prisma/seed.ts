/**
 * DEVELOPMENT / DEMO DATA ONLY
 * Creates the demo account and realistic sample prompts, versions and analyses.
 * Every analysis is produced by the real scanning pipeline (Local Analysis Mode);
 * only the timestamps are back-dated so the dashboard trend has history.
 *
 *   npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { SEED_PLAN } from '../src/data/samplePrompts.js';
import { prisma } from '../src/lib/prisma.js';
import { resolveProvider } from '../src/services/ai/aiService.js';
import { executeAnalysis } from '../src/services/analysis.service.js';

const DEMO_EMAIL = 'demo@promptshield.local';
const DEMO_PASSWORD = 'Demo@12345';
const HOUR = 60 * 60 * 1000;

const daysAgo = (days: number, extraHours = 0) => new Date(Date.now() - days * 24 * HOUR - extraHours * HOUR);

async function main() {
  console.log('Seeding DEVELOPMENT / DEMO data (not for production use)...');

  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  const user = await prisma.user.create({
    data: { name: 'Demo Analyst', email: DEMO_EMAIL, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) },
  });

  const local = resolveProvider('local');

  for (const plan of SEED_PLAN) {
    const firstVersion = plan.versions[0];
    if (!firstVersion) continue;
    const prompt = await prisma.prompt.create({
      data: {
        userId: user.id,
        title: plan.title,
        category: plan.category,
        description: plan.description,
        createdAt: daysAgo(firstVersion.daysAgo, 3),
      },
    });

    for (const [index, version] of plan.versions.entries()) {
      const saved = await prisma.promptVersion.create({
        data: {
          promptId: prompt.id,
          versionNumber: index + 1,
          content: version.content,
          changeNote: version.changeNote,
          source: 'SEED',
          createdAt: daysAgo(version.daysAgo, 1),
        },
      });
      const analysis = await prisma.analysis.create({
        data: { promptVersionId: saved.id, status: 'RUNNING', mode: 'LOCAL', provider: 'local', startedAt: new Date() },
      });
      await executeAnalysis(analysis.id, version.content, local);

      const result = await prisma.analysis.findUniqueOrThrow({ where: { id: analysis.id } });
      if (result.status !== 'COMPLETED') throw new Error(`Seed analysis failed for "${plan.title}" v${index + 1}`);
      const analysedAt = daysAgo(version.daysAgo);
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          createdAt: analysedAt,
          startedAt: analysedAt,
          completedAt: new Date(analysedAt.getTime() + (result.durationMs ?? 25)),
        },
      });
      console.log(`  - ${plan.title} v${index + 1}: score ${result.overallScore} (${result.riskLevel})`);
    }

    const lastVersion = plan.versions.at(-1) ?? firstVersion;
    await prisma.prompt.update({ where: { id: prompt.id }, data: { updatedAt: daysAgo(lastVersion.daysAgo) } });
  }

  console.log(`\nDemo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
