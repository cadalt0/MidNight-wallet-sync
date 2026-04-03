import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DustSecretKey, LedgerParameters, ZswapSecretKeys } from '@midnight-ntwrk/ledger-v8';
import { type FacadeState, type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { MidnightBech32m, ShieldedAddress, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { type DustWalletOptions, FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import type { MidnightWalletSyncConfig, WalletAlias, WalletSnapshot } from './types.js';
import { loadEnvMap, resolveSeed, walletAliases } from './config.js';
import { saveSnapshot, snapshotPath } from './snapshot.js';

function formatBalances(balances: Record<string, bigint>): Record<string, string> {
  return Object.fromEntries(Object.entries(balances).map(([token, amount]) => [token, amount.toString()]));
}

function formatAddress(networkId: string, address: unknown): string {
  try {
    if (address && typeof address === 'object') {
      return MidnightBech32m.encode(networkId, address as never).asString();
    }
  } catch {
    // fall through
  }
  return String(address);
}

function snapshotFromState(alias: WalletAlias, networkId: string, state: any): WalletSnapshot {
  return {
    alias,
    updatedAt: new Date().toISOString(),
    isSynced: Boolean(state.isSynced),
    shieldedBalances: formatBalances(state.shielded.balances),
    unshieldedBalances: formatBalances(state.unshielded.balances),
    dustBalanceRaw: state.dust.balance(new Date()).toString(),
    shieldedAddress: formatAddress(networkId, state.shielded.address),
    unshieldedAddress: formatAddress(networkId, state.unshielded.address),
    dustAddress: formatAddress(networkId, state.dust.address),
  };
}

function createLogger() {
  return {
    info: (...args: unknown[]) => console.log('[info]', ...args),
    debug: (...args: unknown[]) => console.debug('[debug]', ...args),
    error: (...args: unknown[]) => console.error('[error]', ...args),
  } as const;
}

class WalletService {
  readonly wallet: WalletFacade;

  private constructor(
    private readonly logger: ReturnType<typeof createLogger>,
    private readonly cwd: string,
    private readonly networkId: string,
    wallet: WalletFacade,
    private readonly shieldedSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
  ) {
    this.wallet = wallet;
  }

  static async build(logger: ReturnType<typeof createLogger>, config: MidnightWalletSyncConfig, seed: string) {
    const environment = {
      walletNetworkId: config.network,
      networkId: config.network,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      proofServer: config.proofServer,
    };
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };
    const walletFacadeBuilder = FluentWalletBuilder.forEnvironment(environment).withDustOptions(dustOptions);
    const buildResult = await walletFacadeBuilder.withSeed(seed).buildWithoutStarting();
    const { wallet, seeds } = buildResult as {
      wallet: WalletFacade;
      seeds: { masterSeed: string; shielded: Uint8Array; dust: Uint8Array };
    };
    logger.info(`Wallet built from seed: ${seeds.masterSeed.slice(0, 8)}...`);
    return new WalletService(
      logger,
      process.cwd(),
      environment.networkId,
      wallet,
      ZswapSecretKeys.fromSeed(seeds.shielded),
      DustSecretKey.fromSeed(seeds.dust),
    );
  }

  async start(): Promise<void> {
    this.logger.info('Starting wallet...');
    await this.wallet.start(this.shieldedSecretKeys, this.dustSecretKey);
  }

  async stop(): Promise<void> {
    await this.wallet.stop();
  }

  async waitSynced(): Promise<FacadeState> {
    return this.wallet.waitForSyncedState();
  }

  subscribeSnapshots(
    alias: WalletAlias,
    stateDir: string,
    onSnapshot?: (snapshot: WalletSnapshot) => void,
  ): void {
    this.wallet.state().subscribe((state: any) => {
      const snapshot = snapshotFromState(alias, this.networkId, state);
      saveSnapshot(this.cwd, stateDir, snapshot);
      onSnapshot?.(snapshot);
    });
  }
}

export class WalletSyncRuntime {
  private readonly logger = createLogger();
  private readonly envMap: Record<string, string>;
  private readonly aliases: WalletAlias[];
  private readonly services = new Map<WalletAlias, WalletService>();

  constructor(
    private readonly cwd: string,
    readonly config: MidnightWalletSyncConfig,
  ) {
    this.envMap = loadEnvMap(cwd);
    this.aliases = walletAliases(config.walletCount);
  }

  static fromWorkspace(cwd: string, config: MidnightWalletSyncConfig) {
    return new WalletSyncRuntime(cwd, config);
  }

  private seedFor(alias: WalletAlias): string {
    return resolveSeed(this.envMap, this.config.seedBaseName, alias);
  }

  async startAll(onSnapshot?: (alias: WalletAlias, snapshot: WalletSnapshot) => void): Promise<void> {
    for (const alias of this.aliases) {
      const service = await WalletService.build(this.logger, this.config, this.seedFor(alias));
      this.services.set(alias, service);
      service.subscribeSnapshots(alias, this.config.stateDir, (snapshot) => onSnapshot?.(alias, snapshot));
    }
    await Promise.all(
      Array.from(this.services.entries()).map(async ([alias, service]) => {
        await service.start();
        await service.waitSynced();
        this.logger.info(`Wallet ${alias} synced`);
      }),
    );
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.services.values()).map((service) => service.stop()));
  }

  readSnapshot(alias: WalletAlias): WalletSnapshot | null {
    const path = snapshotPath(this.cwd, this.config.stateDir, alias);
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as WalletSnapshot;
    } catch {
      return null;
    }
  }

  listAliases(): WalletAlias[] {
    return [...this.aliases];
  }

  get port(): number {
    return this.config.port;
  }

  createServer() {
    return createServer(async (req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
      const pathParts = requestUrl.pathname.split('/').filter(Boolean);

      if (requestUrl.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (requestUrl.pathname === '/wallets') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, wallets: this.listAliases() }, null, 2));
        return;
      }

      if (pathParts[0] === 'balance' && pathParts.length === 2) {
        const alias = pathParts[1] as WalletAlias;
        const snapshot = this.readSnapshot(alias);
        if (!snapshot) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: `No snapshot for ${alias}` }));
          return;
        }
        if (!snapshot.isSynced) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: 'Wallet not fully synced yet.' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ...snapshot }, null, 2));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'Use /health, /wallets, or /balance/:alias' }));
    });
  }
}
