import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TargetField } from './config.js';
import type { ScanItem } from './scan.js';
import type { BatchUpdateFieldResult } from './batch.js';

export interface ReportRow {
  storeId: string;
  storeUrl: string;
  runId: string;
  productId: number;
  sku: string;
  name: string;
  permalink: string;
  field: TargetField;
  missing: boolean;
  generated: string;
  status: 'applied' | 'skipped' | 'error' | 'rejected' | 'insufficient_data';
  reason?: string | undefined;
  dryRun?: boolean | undefined;
  model: string;
  promptVersion: string;
}

export class Report {
  private rows: ReportRow[] = [];
  constructor(public readonly storeId: string, public readonly storeUrl: string, public readonly runId: string) {}

  add(row: Omit<ReportRow, 'storeId' | 'storeUrl' | 'runId'>) {
    this.rows.push({ ...row, storeId: this.storeId, storeUrl: this.storeUrl, runId: this.runId });
  }

  insufficientData(item: ScanItem, model: string, promptVersion: string) {
    for (const field of item.missing_fields) {
      this.add({
        productId: item.id,
        sku: item.sku,
        name: item.name,
        permalink: item.permalink,
        field,
        missing: true,
        generated: '',
        status: 'insufficient_data',
        model,
        promptVersion,
      });
    }
  }

  recordOutcome(
    item: ScanItem,
    field: TargetField,
    generated: string,
    outcome: BatchUpdateFieldResult,
    model: string,
    promptVersion: string,
  ) {
    this.add({
      productId: item.id,
      sku: item.sku,
      name: item.name,
      permalink: item.permalink,
      field,
      missing: true,
      generated,
      status: outcome.status,
      reason: outcome.reason,
      dryRun: outcome.dry_run,
      model,
      promptVersion,
    });
  }

  recordRejected(item: ScanItem, field: TargetField, generated: string, reason: string, model: string, promptVersion: string) {
    this.add({
      productId: item.id,
      sku: item.sku,
      name: item.name,
      permalink: item.permalink,
      field,
      missing: true,
      generated,
      status: 'rejected',
      reason,
      model,
      promptVersion,
    });
  }

  summary() {
    const counts: Record<string, number> = {};
    for (const r of this.rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return { total: this.rows.length, byStatus: counts };
  }

  async write(dir: string) {
    await mkdir(dir, { recursive: true });
    const base = resolve(dir, `${this.runId}-${this.storeId}`);
    await writeFile(`${base}.json`, JSON.stringify({ runId: this.runId, storeId: this.storeId, summary: this.summary(), rows: this.rows }, null, 2), 'utf8');
    await writeFile(`${base}.csv`, toCsv(this.rows), 'utf8');
    return { json: `${base}.json`, csv: `${base}.csv` };
  }
}

function toCsv(rows: ReportRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!) as (keyof ReportRow)[];
  const escape = (v: unknown) => {
    if (v === undefined || v === null) return '';
    const s = String(v).replace(/\r\n/g, '\n');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}
