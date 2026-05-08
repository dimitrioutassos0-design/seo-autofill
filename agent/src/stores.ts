import { request } from 'undici';
import pLimit from 'p-limit';
import type { WcStore } from './config.js';

export interface StoreClient {
  store: WcStore;
  get<T>(path: string, query?: Record<string, string | number>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export function createStoreClient(store: WcStore): StoreClient {
  const limiter = pLimit(store.concurrency);
  const minIntervalMs = 1000 / store.rps;
  let nextSlot = 0;

  const authHeader = (): Record<string, string> => {
    if (store.auth.type === 'token') {
      return { authorization: `Bearer ${store.auth.value}` };
    }
    const basic = Buffer.from(`${store.auth.username}:${store.auth.value}`).toString('base64');
    return { authorization: `Basic ${basic}` };
  };

  const waitForSlot = async () => {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + minIntervalMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };

  const send = async <T>(method: 'GET' | 'POST', path: string, opts: { query?: Record<string, string | number> | undefined; body?: unknown }): Promise<T> => {
    const url = new URL(path.replace(/^\//, ''), store.baseUrl.endsWith('/') ? store.baseUrl : store.baseUrl + '/');
    if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));

    const maxAttempts = 5;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await waitForSlot();
      try {
        const res = await request(url, {
          method,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...authHeader(),
          },
          body: opts.body === undefined ? null : JSON.stringify(opts.body),
        });

        if (res.statusCode === 429 || (res.statusCode >= 500 && res.statusCode < 600)) {
          await res.body.dump();
          if (attempt === maxAttempts) {
            throw new Error(`HTTP ${res.statusCode} after ${attempt} attempts`);
          }
          const backoff = Math.min(30_000, 2 ** attempt * 250) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        const text = await res.body.text();
        if (res.statusCode >= 400) {
          throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`);
        }
        return text === '' ? ({} as T) : (JSON.parse(text) as T);
      } catch (err) {
        lastErr = err;
        if (attempt === maxAttempts) break;
        const backoff = Math.min(30_000, 2 ** attempt * 250) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Unknown request error');
  };

  return {
    store,
    get: (path, query) => limiter(() => send('GET', path, { query })),
    post: (path, body) => limiter(() => send('POST', path, { body })),
    schedule: (fn) => limiter(fn),
  };
}
