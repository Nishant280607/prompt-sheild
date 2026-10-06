#!/usr/bin/env node
/**
 * One-command local setup for Prompt Shield.
 *
 *   npm install
 *   npm run setup
 *
 * 1. Creates server/.env from .env.example (with a freshly generated JWT secret)
 * 2. Generates the Prisma client
 * 3. Applies database migrations (SQLite)
 * 4. Seeds demo data (skip with --skip-seed)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

function step(message) {
  console.log(`\n\x1b[36m▸ ${message}\x1b[0m`);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n\x1b[31m✖ Command failed: ${command} ${commandArgs.join(' ')}\x1b[0m`);
    process.exit(result.status ?? 1);
  }
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Prompt Shield requires Node.js 20.19+ (22 LTS recommended). Found ${process.versions.node}.`);
  process.exit(1);
}

step('Preparing environment file (server/.env)');
const envTarget = join(root, 'server', '.env');
if (existsSync(envTarget)) {
  console.log('  server/.env already exists - leaving it unchanged.');
} else {
  const template = readFileSync(join(root, '.env.example'), 'utf8');
  const secret = randomBytes(48).toString('hex');
  let env = template.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${secret}"`);
  // --skip-seed also stops the server from creating the demo account on start-up.
  if (args.has('--skip-seed')) env = env.replace(/^DEMO_ACCOUNT=.*$/m, 'DEMO_ACCOUNT="false"');
  writeFileSync(envTarget, env, { encoding: 'utf8', flag: 'wx' });
  console.log('  Created server/.env with a random JWT_SECRET.');
}

step('Generating Prisma client');
run('npm', ['run', 'db:generate', '-w', 'server']);

step('Applying database migrations');
run('npm', ['run', 'db:deploy', '-w', 'server']);

if (args.has('--skip-seed')) {
  step('Skipping demo data (--skip-seed)');
} else {
  step('Seeding demo data');
  run('npm', ['run', 'db:seed', '-w', 'server']);
}

console.log(`
\x1b[32m✔ Setup complete.\x1b[0m

  Start both apps:     npm run dev
  Frontend:            http://localhost:5173
  API:                 http://localhost:5000/api/health

  Demo login:          demo@promptshield.local / Demo@12345
`);
