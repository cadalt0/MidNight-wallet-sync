import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MidnightWalletSyncConfig, WalletAlias } from './types.js';

export const CONFIG_FILE_NAME = 'midnightwalletsync.config.json';
export const ENV_FILE_NAME = '.env';
export const ENV_EXAMPLE_FILE_NAME = '.env.example';

export function defaultConfig(): MidnightWalletSyncConfig {
  return {
    network: 'preprod',
    seedBaseName: 'wallet_id',
    walletCount: 3,
    stateDir: '.midnightwalletsync',
    port: 8787,
    nightDecimals: 6,
    dustDecimals: 15,
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    nodeWS: 'wss://rpc.preprod.midnight.network',
    proofServer: 'https://proof.preprod.midnight.network',
  };
}

export function configPath(cwd = process.cwd()): string {
  return join(cwd, CONFIG_FILE_NAME);
}

export function envPath(cwd = process.cwd()): string {
  return join(cwd, ENV_FILE_NAME);
}

export function envExamplePath(cwd = process.cwd()): string {
  return join(cwd, ENV_EXAMPLE_FILE_NAME);
}

export function normalizeConfig(config: Partial<MidnightWalletSyncConfig>): MidnightWalletSyncConfig {
  const base = defaultConfig();
  const walletCount = Number(config.walletCount ?? base.walletCount);
  return {
    network: String(config.network ?? base.network),
    seedBaseName: String(config.seedBaseName ?? base.seedBaseName),
    walletCount: Number.isFinite(walletCount) && walletCount > 0 ? Math.floor(walletCount) : base.walletCount,
    stateDir: String(config.stateDir ?? base.stateDir),
    port: Number(config.port ?? base.port),
    nightDecimals: Number(config.nightDecimals ?? base.nightDecimals),
    dustDecimals: Number(config.dustDecimals ?? base.dustDecimals),
    indexer: String(config.indexer ?? base.indexer),
    indexerWS: String(config.indexerWS ?? base.indexerWS),
    node: String(config.node ?? base.node),
    nodeWS: String(config.nodeWS ?? base.nodeWS),
    proofServer: String(config.proofServer ?? base.proofServer),
  };
}

export function writeDefaultConfig(cwd = process.cwd()): MidnightWalletSyncConfig {
  const config = defaultConfig();
  writeFileSync(configPath(cwd), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

export function ensureConfig(cwd = process.cwd()): MidnightWalletSyncConfig {
  const path = configPath(cwd);
  if (!existsSync(path)) {
    return writeDefaultConfig(cwd);
  }
  const raw = readFileSync(path, 'utf8');
  return normalizeConfig(JSON.parse(raw) as Partial<MidnightWalletSyncConfig>);
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvMap(cwd = process.cwd()): Record<string, string> {
  const fromProcess = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  );
  const file = envPath(cwd);
  if (!existsSync(file)) {
    return fromProcess;
  }
  const fileEnv = parseEnvFile(readFileSync(file, 'utf8'));
  return {
    ...fromProcess,
    ...fileEnv,
  };
}

export function seedKey(baseName: string, alias: WalletAlias): string {
  return `${baseName}_${alias}`;
}

export function resolveSeed(envMap: Record<string, string>, baseName: string, alias: WalletAlias): string {
  const key = seedKey(baseName, alias);
  const direct = envMap[key] ?? envMap[baseName];
  if (!direct) {
    throw new Error(`Missing seed for ${alias}. Expected ${key} in .env`);
  }
  return direct;
}

export function walletAliases(walletCount: number): WalletAlias[] {
  return Array.from({ length: walletCount }, (_, index) => `n${index + 1}` as WalletAlias);
}

export function ensureWorkspaceFiles(cwd = process.cwd()): MidnightWalletSyncConfig {
  const config = ensureConfig(cwd);
  if (!existsSync(envExamplePath(cwd))) {
    const lines = walletAliases(config.walletCount).map((alias) => `${seedKey(config.seedBaseName, alias)}=replace_me`);
    writeFileSync(envExamplePath(cwd), `${lines.join('\n')}\n`, 'utf8');
  }
  if (!existsSync(envPath(cwd))) {
    writeFileSync(envPath(cwd), `# Copy values from .env.example into this file\n`, 'utf8');
  }
  mkdirSync(join(cwd, config.stateDir), { recursive: true });
  return config;
}
