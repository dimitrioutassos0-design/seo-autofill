import pLimit from 'p-limit';
import type { Store, TargetField, Config, WcStore, ShopifyStore } from './config.js';
import { fieldsForPlatform } from './config.js';
import type { ScanItem } from './scan.js';
import type { BatchUpdateInput, BatchUpdateProductResult } from './batch.js';
import { createStoreClient } from './stores.js';
import { iterateScan } from './scan.js';
import { sendBatch } from './batch.js';
import { createShopifyClient } from './shopify-client.js';
import { iterateShopifyScan } from './shopify-scan.js';
import { sendShopifyBatch } from './shopify-batch.js';

export interface PlatformAdapter {
  store: Store;
  targetFields: readonly TargetField[];
  scan(perPage?: number): AsyncGenerator<ScanItem>;
  batchUpdate(runId: string, dryRun: boolean, updates: BatchUpdateInput[]): Promise<BatchUpdateProductResult[]>;
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export function createAdapter(store: Store, _cfg: Config): PlatformAdapter {
  if (store.platform === 'shopify') return createShopifyAdapter(store);
  return createWcAdapter(store);
}

function createWcAdapter(store: WcStore): PlatformAdapter {
  const client = createStoreClient(store);
  return {
    store,
    targetFields: fieldsForPlatform('woocommerce'),
    scan: (perPage) => iterateScan(client, perPage),
    batchUpdate: (runId, dryRun, updates) => sendBatch(client, runId, dryRun, updates, store.batchSize),
    schedule: (fn) => client.schedule(fn),
  };
}

function createShopifyAdapter(store: ShopifyStore): PlatformAdapter {
  const client = createShopifyClient(store);
  const limiter = pLimit(store.concurrency);
  return {
    store,
    targetFields: fieldsForPlatform('shopify'),
    scan: (perPage) => iterateShopifyScan(client, perPage),
    batchUpdate: (runId, dryRun, updates) => sendShopifyBatch(client, runId, dryRun, updates),
    schedule: (fn) => limiter(fn),
  };
}
