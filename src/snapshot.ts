import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WalletAlias, WalletSnapshot } from './types.js';

export function snapshotDirPath(cwd: string, stateDir: string): string {
  return join(cwd, stateDir);
}

export function snapshotPath(cwd: string, stateDir: string, alias: WalletAlias): string {
  return join(snapshotDirPath(cwd, stateDir), `${alias}.json`);
}

export function saveSnapshot(cwd: string, stateDir: string, snapshot: WalletSnapshot): void {
  const dir = snapshotDirPath(cwd, stateDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(snapshotPath(cwd, stateDir, snapshot.alias), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function loadSnapshot(
  cwd: string,
  stateDir: string,
  alias: WalletAlias,
): WalletSnapshot | null {
  const path = snapshotPath(cwd, stateDir, alias);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as WalletSnapshot;
}

export function listSavedSnapshots(cwd: string, stateDir: string): WalletSnapshot[] {
  const dir = snapshotDirPath(cwd, stateDir);
  if (!existsSync(dir)) {
    return [];
  }
  return [];
}
