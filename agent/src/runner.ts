import pLimit from 'p-limit';
import type { Config, TargetField } from './config.js';
import { createProvider, generateField, type LlmProvider } from './generate/index.js';
import { validateGeneration } from './validate.js';
import type { BatchUpdateInput } from './batch.js';
import type { ScanItem } from './scan.js';
import { hasSufficientSignal } from './scan.js';
import { Report } from './report.js';
import { createAdapter, type PlatformAdapter } from './platform.js';

export interface RunOptions {
  storeFilter?: string;
  productLimit?: number;
}

export async function runAll(
  cfg: Config,
  opts: RunOptions = {},
): Promise<{ runId: string; perStore: Record<string, ReturnType<Report['summary']>> }> {
  const runId = newRunId();
  const provider = createProvider(cfg);
  const targets = cfg.stores.filter((s) => !opts.storeFilter || s.id === opts.storeFilter);
  if (targets.length === 0) throw new Error('No matching stores in config.');

  const perStore: Record<string, ReturnType<Report['summary']>> = {};
  await Promise.all(
    targets.map(async (store) => {
      const adapter = createAdapter(store, cfg);
      const summary = await runStore(cfg, provider, adapter, runId, opts);
      perStore[store.id] = summary;
    }),
  );
  return { runId, perStore };
}

interface PendingUpdate {
  input: BatchUpdateInput;
  item: ScanItem;
}

async function runStore(
  cfg: Config,
  provider: LlmProvider,
  adapter: PlatformAdapter,
  runId: string,
  opts: RunOptions,
): Promise<ReturnType<Report['summary']>> {
  const store = adapter.store;
  const report = new Report(store.id, 'baseUrl' in store ? store.baseUrl : store.storeDomain, runId);
  const generationLimit = pLimit(store.concurrency);
  const flushThreshold = store.batchSize * 4;
  const targetFields = adapter.targetFields;

  let pending: PendingUpdate[] = [];
  let processed = 0;

  for await (const item of adapter.scan()) {
    if (opts.productLimit && processed >= opts.productLimit) break;
    processed += 1;

    const missing = item.missing_fields.filter((f) => targetFields.includes(f));
    if (missing.length === 0) continue;

    if (!hasSufficientSignal(item, cfg.minSignalChars)) {
      report.insufficientData(item, provider.model, '');
      continue;
    }

    const fields: Partial<Record<TargetField, string>> = {};
    let promptVersion = '';

    await Promise.all(
      missing.map((field) =>
        generationLimit(async () => {
          try {
            const result = await generateField(provider, field, item);
            promptVersion = result.promptVersion;
            const v = validateGeneration(result, item, fields);
            if (!v.ok) {
              report.recordRejected(item, field, result.text, v.reason, result.model, result.promptVersion);
              return;
            }
            fields[field] = v.text;
          } catch (err) {
            report.recordRejected(item, field, '', `error:${(err as Error).message}`, provider.model, '');
          }
        }),
      ),
    );

    if (Object.keys(fields).length === 0) continue;

    const input: BatchUpdateInput & { _shopifyGid?: string } = {
      product_id: item.id,
      fields,
      model: provider.model,
      prompt_version: promptVersion,
    };
    if (item._shopifyGid) input._shopifyGid = item._shopifyGid;

    pending.push({ input, item });

    if (pending.length >= flushThreshold) {
      await flushPending(adapter, runId, cfg.dryRun, pending, report, targetFields);
      pending = [];
    }
  }

  if (pending.length > 0) {
    await flushPending(adapter, runId, cfg.dryRun, pending, report, targetFields);
  }

  await report.write(cfg.reportsDir);
  return report.summary();
}

async function flushPending(
  adapter: PlatformAdapter,
  runId: string,
  dryRun: boolean,
  pending: PendingUpdate[],
  report: Report,
  targetFields: readonly TargetField[],
): Promise<void> {
  const inputs = pending.map((p) => p.input);
  const itemMap = new Map(pending.map((p) => [p.item.id, p.item]));
  const inputMap = new Map(pending.map((p) => [p.input.product_id, p.input]));

  const responses = await adapter.batchUpdate(runId, dryRun, inputs);

  for (const res of responses) {
    const item = itemMap.get(res.product_id);
    const input = inputMap.get(res.product_id);
    if (!item || !input) continue;

    if (res.error) {
      for (const field of targetFields) {
        if (input.fields[field] === undefined) continue;
        report.recordOutcome(item, field, input.fields[field] ?? '', { status: 'error', reason: res.error }, input.model, input.prompt_version);
      }
      continue;
    }

    for (const [field, outcome] of Object.entries(res.fields)) {
      if (!targetFields.includes(field as TargetField)) continue;
      report.recordOutcome(item, field as TargetField, input.fields[field as TargetField] ?? '', outcome, input.model, input.prompt_version);
    }
  }
}

function newRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
