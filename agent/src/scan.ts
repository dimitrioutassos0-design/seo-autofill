import type { StoreClient } from './stores.js';
import type { TargetField } from './config.js';

export interface ScanItem {
  id: number;
  sku: string;
  name: string;
  permalink: string;
  type: string;
  categories: { name: string; slug: string }[];
  tags: { name: string; slug: string }[];
  attributes: { name: string; values: string[] }[];
  image_alt: string[];
  current: Record<string, string>;
  missing_fields: TargetField[];
  _shopifyGid?: string | undefined;
  _shopifyHandle?: string | undefined;
}

interface ScanPage {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  items: ScanItem[];
}

export interface WorkItem {
  storeId: string;
  product: ScanItem;
  missing: TargetField[];
}

export async function* iterateScan(client: StoreClient, perPage = 50): AsyncGenerator<ScanItem> {
  let page = 1;
  let totalPages = 1;
  do {
    const data = await client.get<ScanPage>('wp-json/seo-autofill/v1/scan', {
      page,
      per_page: perPage,
      status: client.store.statuses.join(','),
    });
    totalPages = data.total_pages || 1;
    for (const item of data.items) yield item;
    if (data.items.length === 0) break;
    page += 1;
  } while (page <= totalPages);
}

export function hasSufficientSignal(item: ScanItem, minChars: number): boolean {
  const parts = [
    item.name,
    item.sku,
    ...item.categories.map((c) => c.name),
    ...item.tags.map((t) => t.name),
    ...item.attributes.flatMap((a) => [a.name, ...a.values]),
    ...item.image_alt,
    item.current['description'] ?? '',
    item.current['short_description'] ?? '',
  ];
  return parts.join(' ').replace(/\s+/g, ' ').trim().length >= minChars;
}
