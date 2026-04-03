import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureWorkspaceFiles, envExamplePath, envPath, seedKey, walletAliases } from './config.js';
import { WalletSyncRuntime } from './runtime.js';
import type { WalletAlias } from './types.js';

const NIGHT_TOKEN_TYPE = '0000000000000000000000000000000000000000000000000000000000000000';

function formatUnits(raw: bigint, decimals: number): string {
  if (decimals <= 0) {
    return raw.toString();
  }
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionText}`;
}

function labelToken(token: string): string {
  return token === NIGHT_TOKEN_TYPE ? 'NIGHT' : token;
}

function usage(): void {
  console.log([
    'MidNight-walletsync commands:',
    '  init',
    '  sync',
    '  status',
    '  balance <n1|n2|...>',
  ].join('\n'));
}

function printSnapshot(snapshot: any, nightDecimals: number, dustDecimals: number): void {
  const unshieldedBalances = snapshot.unshieldedBalances ?? {};
  const shieldedBalances = snapshot.shieldedBalances ?? {};
  const nightRaw = BigInt(unshieldedBalances[NIGHT_TOKEN_TYPE] ?? '0') + BigInt(shieldedBalances[NIGHT_TOKEN_TYPE] ?? '0');
  const dustRaw = BigInt(snapshot.dustBalanceRaw ?? '0');

  const labeledUnshielded = Object.fromEntries(
    Object.entries(unshieldedBalances).map(([token, amount]) => [labelToken(token), amount]),
  );
  const labeledShielded = Object.fromEntries(
    Object.entries(shieldedBalances).map(([token, amount]) => [labelToken(token), amount]),
  );

  const otherUnshielded = Object.fromEntries(
    Object.entries(unshieldedBalances).filter(([token]) => token !== NIGHT_TOKEN_TYPE),
  );
  const otherShielded = Object.fromEntries(
    Object.entries(shieldedBalances).filter(([token]) => token !== NIGHT_TOKEN_TYPE),
  );

  console.log('=== WALLET BALANCE ===');
  console.log(`alias: ${snapshot.alias}`);
  console.log(`updatedAt: ${snapshot.updatedAt}`);
  console.log(`synced: ${snapshot.isSynced}`);
  console.log(`unshielded address: ${snapshot.unshieldedAddress}`);
  console.log(`shielded address: ${snapshot.shieldedAddress}`);
  console.log(`dust address: ${snapshot.dustAddress}`);
  console.log('');
  console.log('unshielded balances:');
  console.log(JSON.stringify(labeledUnshielded, null, 2));
  console.log(`NIGHT: ${formatUnits(nightRaw, nightDecimals)}`);
  console.log(`DUST: ${formatUnits(dustRaw, dustDecimals)}`);
  console.log('');
  console.log('other unshielded tokens (raw):');
  console.log(JSON.stringify(otherUnshielded, null, 2));
  console.log('other shielded tokens (raw):');
  console.log(JSON.stringify(otherShielded, null, 2));
  console.log('');
  console.log('shielded balances:');
  console.log(JSON.stringify(labeledShielded, null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const cwd = process.cwd();

  if (!command) {
    usage();
    return;
  }

  if (command === 'init') {
    const config = ensureWorkspaceFiles(cwd);
    const example = walletAliases(config.walletCount)
      .map((alias) => `${seedKey(config.seedBaseName, alias)}=replace_me`)
      .join('\n');
    writeFileSync(envExamplePath(cwd), `${example}\n`, 'utf8');
    console.log(`Created ${join(cwd, 'midnightwalletsync.config.json')}`);
    console.log(`Created ${envExamplePath(cwd)}`);
    return;
  }

  const config = ensureWorkspaceFiles(cwd);
  const runtime = WalletSyncRuntime.fromWorkspace(cwd, config);

  if (command === 'sync') {
    const server = runtime.createServer();
    const shutdown = async () => {
      server.close();
      await runtime.stopAll();
      process.exit(0);
    };
    const keepAlive = new Promise<void>((resolve) => {
      process.once('SIGINT', () => { void shutdown().finally(resolve); });
      process.once('SIGTERM', () => { void shutdown().finally(resolve); });
    });
    server.listen(config.port, '127.0.0.1', () => {
      console.log(`[info] server listening on http://127.0.0.1:${config.port}`);
    });
    await runtime.startAll();
    console.log('[info] all wallets synced');
    await keepAlive;
    return;
  }

  if (command === 'status') {
    console.log(`Config file: ${join(cwd, 'midnightwalletsync.config.json')}`);
    console.log(`Env file: ${envPath(cwd)}`);
    console.log(`Wallets: ${runtime.listAliases().join(', ')}`);
    return;
  }

  if (command === 'balance') {
    const alias = (args[0] ?? 'n1') as WalletAlias;
    const snapshotPath = join(cwd, config.stateDir, `${alias}.json`);
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    if (!snapshot.isSynced) {
      console.log('[info] wallet is not fully synced yet');
      return;
    }
    printSnapshot(snapshot, config.nightDecimals, config.dustDecimals);
    return;
  }

  usage();
}

main().catch((error) => {
  console.error('[error]', error);
  process.exit(1);
});
