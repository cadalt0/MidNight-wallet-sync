# MidNight-walletsync

A lightweight Midnight wallet synchronization SDK and CLI for keeping one or more wallets synced, saving snapshots locally, and querying balances from a running synced process.

This package is designed for a local workspace. It is not a public RPC replacement and it does not hold any secrets by itself; it reads seeds from your `.env` file and uses them to build and start wallet instances.

## What this SDK does

- Builds wallets from seed values
- Starts and keeps wallets synced to the Midnight network
- Stores wallet snapshots on disk
- Exposes a tiny local HTTP server for status and balance queries
- Supports multiple wallets at the same time using aliases like `n1`, `n2`, `n3`
- Formats balance output in a readable way
- Shows NIGHT and DUST with decimal formatting

## Why this exists

The main idea is to keep a wallet synced once, then reuse that synced wallet state for repeated balance checks and for other local tooling.

That means:

- you do not need to resync every time
- another terminal can query the synced wallet
- other local SDK code can be built on top of the same synced wallet process


## Configuration


### `.env`

Seeds are loaded from environment variables.

With the default config, the package expects:

- `wallet_id_n1`
- `wallet_id_n2`
- `wallet_id_n3`

If you change `seedBaseName`, the variable names change too.

Example:

- `seedBaseName = wallet_id`
- alias = `n1`
- expected env key = `wallet_id_n1`

## Commands

Commands are invoked using `npx midnightsync <command>` in your workspace.

For example:

```sh
npx midnightsync sync
npx midnightsync balance n1
npx midnightsync status
```

Or use the npm script shortcuts:

```sh
npm run sync
npm run balance -- n1
npm run status
```

### `npx midnightsync init`

Creates or refreshes:

- `midnightwalletsync.config.json`
- `.env.example`
- `.env` if missing

Use this first in a fresh workspace.

### `npx midnightsync sync`

Starts the sync runtime.

What happens:

1. The SDK reads config and seeds
2. Wallets are built from the seeds
3. Wallets are started
4. Sync begins
5. Snapshots are written into `.midnightwalletsync/`
6. A local server starts on `http://127.0.0.1:8787`

Stop it with Ctrl+C.

### `npx midnightsync status`

Prints:

- config file location
- env file location
- wallet aliases currently configured

### `npx midnightsync balance <alias>`

Reads the latest saved snapshot for a wallet alias and prints balances in a human-friendly format.

Default alias is `n1`.

Example:

```sh
npx midnightsync balance n1
npx midnightsync balance n2
```

## Local HTTP API

When sync is running, the SDK exposes a small local server.

### `GET /health`

Returns whether the server is up.

### `GET /wallets`

Returns the configured wallet aliases.

### `GET /balance/:alias`

Returns the latest snapshot for a wallet alias.

Examples:

- `http://127.0.0.1:8787/balance/n1`
- `http://127.0.0.1:8787/balance/n2`

Important:

- the balance endpoint only returns data when the wallet has fully synced
- if the wallet is not synced yet, it returns a `503`
- if the snapshot does not exist, it returns a `404`

## Multi-wallet behavior

If `walletCount` is greater than 1, the SDK starts multiple wallets in parallel.

Each wallet gets an alias:

- `n1`
- `n2`
- `n3`
- and so on

Each alias maps to a seed key in `.env`.

This makes it possible to keep several wallets synced in one process.

## Typical workflow

1. Run `npx midnightsync init`
2. Put real seeds into `.env`
3. Adjust `midnightwalletsync.config.json` if needed
4. Run `npx midnightsync sync`
5. Open another terminal
6. Run `npx midnightsync balance n1`
7. Query `http://127.0.0.1:8787/balance/n1` if you want JSON output

## Can other SDKs use this?

Yes, conceptually this SDK can act like a local wallet service.

That means another local SDK can:

- wait for the wallet to sync
- read balances and addresses
- build higher-level logic on top of the synced wallet state

## Notes

- This package is currently scoped to preprod usage
- Seeds are required for private wallet control
- Balance queries are intentionally blocked until sync is complete
- The local server is meant for localhost use only

## Troubleshooting

### `wallet is not fully synced yet`

Wait for `npm run sync` to finish syncing, then query again.

### `Missing seed for n1`

Add the correct seed to `.env` using the expected key name.

### Nothing prints in balance

Check that the wallet alias exists and that the snapshot file is present in `.midnightwalletsync/`.
