import type { StoreClient } from './stores.js';
import type { TargetField } from './config.js';

export interface BatchUpdateInput {
  product_id: number;
  fields: Partial<Record<TargetField, string>>;
  model: string;
  prompt_version: string;
}

export interface BatchUpdateFieldResult {
  status: 'applied' | 'skipped' | 'error';
  reason?: string;
  dry_run?: boolean;
}

export interface BatchUpdateProductResult {
  product_id: number;
  fields: Record<string, BatchUpdateFieldResult>;
  error?: string;
}

export interface BatchUpdateResponse {
  run_id: string;
  dry_run: boolean;
  results: BatchUpdateProductResult[];
}

export async function sendBatch(
  client: StoreClient,
  runId: string,
  dryRun: boolean,
  updates: BatchUpdateInput[],
  batchSize: number,
): Promise<BatchUpdateProductResult[]> {
  const out: BatchUpdateProductResult[] = [];
  for (let i = 0; i < updates.length; i += batchSize) {
    const slice = updates.slice(i, i + batchSize);
    const res = await client.post<BatchUpdateResponse>('wp-json/seo-autofill/v1/updates/batch', {
      run_id: runId,
      dry_run: dryRun,
      updates: slice,
    });
    out.push(...res.results);
  }
  return out;
}
