#!/usr/bin/env node

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const tsx = join(rootDir, '..', 'node_modules', '.bin', 'tsx');

const args = process.argv.slice(2);
const env = {
  ...process.env,
  NODE_OPTIONS: '--no-deprecation',
};

const child = spawn(tsx, [join(rootDir, 'src', 'cli.ts'), ...args], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
