import type { ScanItem } from './scan.js';
import type { GenerationResult } from './generate/index.js';

const PLACEHOLDER_PATTERNS = [
  /lorem\s+ipsum/i,
  /\btodo\b/i,
  /\bplaceholder\b/i,
  /xxxx+/i,
  /^[A-Z0-9_-]{3,}$/,
];

const BANNED_CLAIM_PATTERNS = [
  /\b(certified|FDA[- ]approved|ISO[- ]?\d+|CE[- ]marked)\b/i,
  /\b(lifetime warranty|money[- ]back guarantee|free shipping)\b/i,
  /\b(in stock|out of stock|ships? (today|tomorrow))\b/i,
  /\b(\$|€|£|USD|EUR|GBP)\s?\d+(\.\d{1,2})?\b/i,
  /\b(100%|guaranteed)\s+(organic|natural|vegan|hypoallergenic)\b/i,
];

export interface ValidationOk {
  ok: true;
  text: string;
}
export interface ValidationFail {
  ok: false;
  reason: string;
}
export type Validation = ValidationOk | ValidationFail;

export function validateGeneration(result: GenerationResult, item: ScanItem, otherFields: Partial<Record<string, string>>): Validation {
  const text = result.text.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (text.length < result.minChars) return { ok: false, reason: `too_short:${text.length}<${result.minChars}` };
  if (text.length > result.maxChars) return { ok: false, reason: `too_long:${text.length}>${result.maxChars}` };

  for (const pat of PLACEHOLDER_PATTERNS) {
    if (pat.test(text)) return { ok: false, reason: `placeholder:${pat}` };
  }
  for (const pat of BANNED_CLAIM_PATTERNS) {
    if (pat.test(text)) return { ok: false, reason: `banned_claim:${pat}` };
  }

  if (item.name && text.trim().toLowerCase() === item.name.trim().toLowerCase()) {
    return { ok: false, reason: 'duplicate_of_name' };
  }
  if (item.sku && text.includes(item.sku) && text.replace(item.sku, '').trim().length < result.minChars / 2) {
    return { ok: false, reason: 'sku_echo' };
  }

  for (const [otherField, otherText] of Object.entries(otherFields)) {
    if (otherField === result.field) continue;
    if (otherText && otherText.trim() === text) {
      return { ok: false, reason: `duplicate_of_${otherField}` };
    }
  }

  return { ok: true, text };
}
