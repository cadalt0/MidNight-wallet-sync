export type MidnightWalletSyncConfig = {
  network: string;
  seedBaseName: string;
  walletCount: number;
  stateDir: string;
  port: number;
  nightDecimals: number;
  dustDecimals: number;
  indexer: string;
  indexerWS: string;
  node: string;
  nodeWS: string;
  proofServer: string;
};

export type WalletAlias = `n${number}`;

export type WalletSnapshot = {
  alias: WalletAlias;
  updatedAt: string;
  isSynced: boolean;
  shieldedBalances: Record<string, string>;
  unshieldedBalances: Record<string, string>;
  dustBalanceRaw: string;
  shieldedAddress: string;
  unshieldedAddress: string;
  dustAddress: string;
};
