import type { ShopifyClient } from './shopify-client.js';
import type { ShopifyField } from './config.js';
import type { BatchUpdateInput, BatchUpdateProductResult, BatchUpdateFieldResult } from './batch.js';

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

interface ProductUpdateResponse {
  productUpdate: {
    product: { id: string } | null;
    userErrors: { field: string[]; message: string }[];
  };
}

export async function sendShopifyBatch(
  client: ShopifyClient,
  runId: string,
  dryRun: boolean,
  updates: BatchUpdateInput[],
): Promise<BatchUpdateProductResult[]> {
  const results: BatchUpdateProductResult[] = [];

  for (const update of updates) {
    const gid = (update as unknown as { _shopifyGid?: string })._shopifyGid;
    if (!gid) {
      results.push({
        product_id: update.product_id,
        fields: Object.fromEntries(
          Object.keys(update.fields).map((f) => [f, { status: 'error' as const, reason: 'missing_shopify_gid' }]),
        ),
      });
      continue;
    }

    const fieldResults: Record<string, BatchUpdateFieldResult> = {};

    if (dryRun) {
      for (const field of Object.keys(update.fields)) {
        fieldResults[field] = { status: 'applied', dry_run: true };
      }
      results.push({ product_id: update.product_id, fields: fieldResults });
      continue;
    }

    const input: Record<string, unknown> = { id: gid };
    const seo: Record<string, string> = {};

    for (const [field, value] of Object.entries(update.fields) as [ShopifyField, string | undefined][]) {
      if (value === undefined) continue;
      switch (field) {
        case 'description':
          input['descriptionHtml'] = value;
          break;
        case 'seo_title':
          seo['title'] = value;
          break;
        case 'seo_description':
          seo['description'] = value;
          break;
      }
    }
    if (Object.keys(seo).length > 0) input['seo'] = seo;

    try {
      const data = await client.query<ProductUpdateResponse>(PRODUCT_UPDATE_MUTATION, { input });
      const errors = data.productUpdate.userErrors;

      if (errors.length > 0) {
        for (const field of Object.keys(update.fields)) {
          fieldResults[field] = { status: 'error', reason: errors.map((e) => e.message).join('; ') };
        }
      } else {
        for (const field of Object.keys(update.fields)) {
          fieldResults[field] = { status: 'applied' };
        }
      }
    } catch (err) {
      for (const field of Object.keys(update.fields)) {
        fieldResults[field] = { status: 'error', reason: (err as Error).message };
      }
    }

    results.push({ product_id: update.product_id, fields: fieldResults });
  }

  return results;
}
