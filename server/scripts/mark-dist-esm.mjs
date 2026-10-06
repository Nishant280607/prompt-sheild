#!/usr/bin/env node
/**
 * Writes dist/package.json with "type": "module".
 *
 * Vercel deploys the files of dist/ at the root of the serverless function, away from
 * server/package.json, so without this marker Node would have to guess that the compiled
 * files are ES modules.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(path.join(dist, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
