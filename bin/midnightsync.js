#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Resolve tsx from package-local node_modules first, then hoisted node_modules.
const localTsxPath = join(rootDir, 'node_modules', '.bin', 'tsx');
const hoistedTsxPath = join(rootDir, '..', '.bin', 'tsx');
const tsxPath = existsSync(localTsxPath) ? localTsxPath : hoistedTsxPath;

const result = spawnSync(tsxPath, [join(rootDir, 'src', 'cli.ts'), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_OPTIONS: '--no-deprecation',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error('[error] failed to start CLI:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
