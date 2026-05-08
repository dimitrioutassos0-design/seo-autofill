import { request } from 'undici';
import type { ShopifyStore } from './config.js';

const API_VERSION = '2025-04';

export interface ShopifyClient {
  store: ShopifyStore;
  query<T>(gql: string, variables?: Record<string, unknown>): Promise<T>;
}

export function createShopifyClient(store: ShopifyStore): ShopifyClient {
  const scheme = store.storeDomain.startsWith('localhost') ? 'http' : 'https';
  const endpoint = `${scheme}://${store.storeDomain}/admin/api/${API_VERSION}/graphql.json`;
  let nextSlot = 0;
  const minInterval = 1000 / store.rps;

  return {
    store,
    async query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
      const now = Date.now();
      const wait = Math.max(0, nextSlot - now);
      nextSlot = Math.max(now, nextSlot) + minInterval;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      const maxAttempts = 5;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await request(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-shopify-access-token': store.auth.accessToken,
            },
            body: JSON.stringify({ query: gql, variables }),
          });

          if (res.statusCode === 429 || res.statusCode >= 500) {
            await res.body.dump();
            if (attempt === maxAttempts) throw new Error(`HTTP ${res.statusCode} after ${attempt} attempts`);
            const backoff = Math.min(30_000, 2 ** attempt * 500) + Math.random() * 250;
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }

          const text = await res.body.text();
          if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`);

          const json = JSON.parse(text) as { data?: T; errors?: { message: string }[] };
          if (json.errors?.length) {
            throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
          }
          return json.data as T;
        } catch (err) {
          lastErr = err;
          if (attempt === maxAttempts) break;
          const backoff = Math.min(30_000, 2 ** attempt * 500) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Unknown Shopify request error');
    },
  };
}
