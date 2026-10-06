/**
 * DEVELOPMENT / DEMO DATA ONLY
 * Re-creates the demo account with realistic sample prompts, versions and analyses
 * (see src/db/demo.ts). The server also creates the demo account automatically on start-up
 * when it is missing, unless DEMO_ACCOUNT=false.
 *
 *   npm run db:seed
 */
import { DEMO_ACCOUNT, seedDemoAccount } from '../src/db/demo.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('Seeding DEVELOPMENT / DEMO data (not for production use)...');
  await seedDemoAccount({ reset: true, log: (line) => console.log(line) });
  console.log(`\nDemo account ready: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
