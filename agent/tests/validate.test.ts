import { describe, it, expect } from 'vitest';
import { validateGeneration } from '../src/validate.js';
import type { ScanItem } from '../src/scan.js';
import type { GenerationResult } from '../src/generate/index.js';

const baseItem: ScanItem = {
  id: 1,
  sku: 'SKU-1',
  name: 'Widget',
  permalink: 'https://example.com/widget',
  type: 'simple',
  categories: [],
  tags: [],
  attributes: [],
  image_alt: [],
  current: { description: '', short_description: '', yoast_title: '', yoast_metadesc: '' },
  missing_fields: ['yoast_title'],
};

function gen(field: GenerationResult['field'], text: string, overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    field,
    text,
    model: 'claude-sonnet-4-6',
    promptVersion: 'test',
    maxChars: 60,
    minChars: 15,
    ...overrides,
  };
}

describe('validateGeneration', () => {
  it('rejects empty', () => {
    const v = validateGeneration(gen('yoast_title', ''), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('rejects too short', () => {
    const v = validateGeneration(gen('yoast_title', 'short'), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('rejects too long', () => {
    const v = validateGeneration(gen('yoast_title', 'x'.repeat(80)), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('rejects placeholder', () => {
    const v = validateGeneration(gen('yoast_title', 'Lorem ipsum dolor sit amet'), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('rejects banned claim', () => {
    const v = validateGeneration(gen('yoast_metadesc', 'Premium widget with lifetime warranty for everyone.', { maxChars: 155, minChars: 20 }), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('rejects duplicate of name', () => {
    const v = validateGeneration(gen('yoast_title', 'Widget', { minChars: 1 }), baseItem, {});
    expect(v.ok).toBe(false);
  });
  it('accepts a clean title', () => {
    const v = validateGeneration(gen('yoast_title', 'Sturdy Widget for Daily Use'), baseItem, {});
    expect(v.ok).toBe(true);
  });
});
