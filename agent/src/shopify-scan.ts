import type { ShopifyClient } from './shopify-client.js';
import type { ShopifyField } from './config.js';
import type { ScanItem } from './scan.js';

const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        description
        productType
        vendor
        tags
        status
        seo { title description }
        featuredImage { url altText }
        images(first: 5) { nodes { url altText } }
        options { name values }
        collections(first: 5) { nodes { title handle } }
        variants(first: 1) { nodes { sku } }
      }
    }
  }
`;

interface GqlProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  status: string;
  seo: { title: string | null; description: string | null };
  featuredImage: { url: string; altText: string | null } | null;
  images: { nodes: { url: string; altText: string | null }[] };
  options: { name: string; values: string[] }[];
  collections: { nodes: { title: string; handle: string }[] };
  variants: { nodes: { sku: string | null }[] };
}

interface ProductsResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GqlProduct[];
  };
}

export async function* iterateShopifyScan(
  client: ShopifyClient,
  perPage = 50,
): AsyncGenerator<ScanItem> {
  let after: string | null = null;
  const statuses = client.store.statuses;
  const statusFilter = statuses.map((s) => `status:${s}`).join(' OR ');
  const queryFilter = statusFilter || undefined;

  do {
    const data: ProductsResponse = await client.query<ProductsResponse>(PRODUCTS_QUERY, {
      first: Math.min(perPage, 250),
      after,
      query: queryFilter,
    });

    const page: ProductsResponse['products'] = data.products;
    for (const node of page.nodes) {
      yield mapToScanItem(node, client.store.storeDomain);
    }

    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.nodes.length === 0) break;
  } while (after);
}

function mapToScanItem(p: GqlProduct, storeDomain: string): ScanItem {
  const descriptionHtml = (p.descriptionHtml ?? '').trim();
  const seoTitle = (p.seo?.title ?? '').trim();
  const seoDesc = (p.seo?.description ?? '').trim();

  const current: Record<string, string> = {
    description: descriptionHtml,
    short_description: '',
    yoast_title: '',
    yoast_metadesc: '',
    seo_title: seoTitle,
    seo_description: seoDesc,
  };

  const missing: ShopifyField[] = [];
  if (!descriptionHtml) missing.push('description');
  if (!seoTitle) missing.push('seo_title');
  if (!seoDesc) missing.push('seo_description');

  const sku = p.variants?.nodes?.[0]?.sku ?? '';
  const imageAlts = p.images.nodes
    .map((img) => img.altText?.trim())
    .filter((a): a is string => !!a);
  if (p.featuredImage?.altText?.trim()) {
    const ft = p.featuredImage.altText.trim();
    if (!imageAlts.includes(ft)) imageAlts.unshift(ft);
  }

  return {
    id: gidToNumeric(p.id),
    sku,
    name: p.title,
    permalink: `https://${storeDomain}/products/${p.handle}`,
    type: p.productType || 'simple',
    categories: p.collections.nodes.map((c) => ({ name: c.title, slug: c.handle })),
    tags: p.tags.map((t) => ({ name: t, slug: t.toLowerCase().replace(/\s+/g, '-') })),
    attributes: p.options
      .filter((o) => o.name !== 'Title')
      .map((o) => ({ name: o.name, values: o.values })),
    image_alt: imageAlts,
    current: current as ScanItem['current'],
    missing_fields: missing as ScanItem['missing_fields'],
    _shopifyGid: p.id,
    _shopifyHandle: p.handle,
  } as ScanItem;
}

function gidToNumeric(gid: string): number {
  const match = gid.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}
