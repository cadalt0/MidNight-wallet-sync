#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tsxPath = join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.js');

const result = spawnSync(process.execPath, [tsxPath, join(rootDir, 'src', 'cli.ts'), ...process.argv.slice(2)], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_OPTIONS: '--no-deprecation',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
