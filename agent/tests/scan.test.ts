import { describe, it, expect } from 'vitest';
import { hasSufficientSignal } from '../src/scan.js';
import type { ScanItem } from '../src/scan.js';

const make = (overrides: Partial<ScanItem>): ScanItem => ({
  id: 1,
  sku: '',
  name: '',
  permalink: '',
  type: 'simple',
  categories: [],
  tags: [],
  attributes: [],
  image_alt: [],
  current: { description: '', short_description: '', yoast_title: '', yoast_metadesc: '' },
  missing_fields: [],
  ...overrides,
});

describe('hasSufficientSignal', () => {
  it('rejects empty product', () => {
    expect(hasSufficientSignal(make({}), 20)).toBe(false);
  });

  it('accepts product with category and attribute signal', () => {
    const item = make({
      name: 'Widget',
      categories: [{ name: 'Hardware', slug: 'hardware' }],
      attributes: [{ name: 'Material', values: ['Steel', 'Aluminium'] }],
    });
    expect(hasSufficientSignal(item, 20)).toBe(true);
  });

  it('honors minChars threshold', () => {
    const item = make({ name: 'X' });
    expect(hasSufficientSignal(item, 50)).toBe(false);
  });
});
