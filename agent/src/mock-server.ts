import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const MOCK_TOKEN = 'mock-token-for-demo';

interface MockProduct {
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
  missing_fields: string[];
}

const products: MockProduct[] = [
  {
    id: 101,
    sku: 'OAK-DESK-01',
    name: 'Solid Oak Standing Desk',
    permalink: 'http://localhost:9877/product/solid-oak-standing-desk',
    type: 'simple',
    categories: [{ name: 'Desks', slug: 'desks' }, { name: 'Office Furniture', slug: 'office-furniture' }],
    tags: [{ name: 'standing desk', slug: 'standing-desk' }, { name: 'ergonomic', slug: 'ergonomic' }],
    attributes: [
      { name: 'Material', values: ['Solid Oak'] },
      { name: 'Dimensions', values: ['120cm x 60cm'] },
      { name: 'Height Range', values: ['72cm - 120cm'] },
    ],
    image_alt: ['Solid oak standing desk in a modern office'],
    current: { description: '', short_description: '', yoast_title: '', yoast_metadesc: '' },
    missing_fields: ['description', 'short_description', 'yoast_title', 'yoast_metadesc'],
  },
  {
    id: 102,
    sku: 'COFF-ETHIO-250',
    name: 'Ethiopian Yirgacheffe Single Origin Coffee',
    permalink: 'http://localhost:9877/product/ethiopian-yirgacheffe-coffee',
    type: 'simple',
    categories: [{ name: 'Coffee', slug: 'coffee' }, { name: 'Single Origin', slug: 'single-origin' }],
    tags: [{ name: 'arabica', slug: 'arabica' }, { name: 'light roast', slug: 'light-roast' }],
    attributes: [
      { name: 'Origin', values: ['Yirgacheffe, Ethiopia'] },
      { name: 'Roast', values: ['Light'] },
      { name: 'Weight', values: ['250g'] },
      { name: 'Tasting Notes', values: ['Blueberry', 'Jasmine', 'Citrus'] },
    ],
    image_alt: ['Bag of Ethiopian Yirgacheffe coffee beans'],
    current: { description: '', short_description: 'Premium Ethiopian single origin.', yoast_title: '', yoast_metadesc: '' },
    missing_fields: ['description', 'yoast_title', 'yoast_metadesc'],
  },
  {
    id: 103,
    sku: 'WOOL-THROW-GRY',
    name: 'Merino Wool Throw Blanket',
    permalink: 'http://localhost:9877/product/merino-wool-throw-blanket',
    type: 'variable',
    categories: [{ name: 'Home Textiles', slug: 'home-textiles' }, { name: 'Blankets', slug: 'blankets' }],
    tags: [{ name: 'merino', slug: 'merino' }, { name: 'winter', slug: 'winter' }],
    attributes: [
      { name: 'Material', values: ['Merino Wool'] },
      { name: 'Colour', values: ['Grey', 'Ivory', 'Navy'] },
      { name: 'Size', values: ['130cm x 180cm'] },
    ],
    image_alt: ['Grey merino wool throw blanket draped over a sofa'],
    current: { description: '', short_description: '', yoast_title: '', yoast_metadesc: '' },
    missing_fields: ['description', 'short_description', 'yoast_title', 'yoast_metadesc'],
  },
  {
    id: 104,
    sku: 'LED-STRIP-5M',
    name: 'RGB LED Strip Light 5m',
    permalink: 'http://localhost:9877/product/rgb-led-strip-light-5m',
    type: 'simple',
    categories: [{ name: 'Lighting', slug: 'lighting' }, { name: 'Smart Home', slug: 'smart-home' }],
    tags: [{ name: 'LED', slug: 'led' }, { name: 'RGB', slug: 'rgb' }, { name: 'smart', slug: 'smart' }],
    attributes: [
      { name: 'Length', values: ['5 metres'] },
      { name: 'Connectivity', values: ['WiFi', 'Bluetooth'] },
      { name: 'Compatibility', values: ['Alexa', 'Google Home'] },
    ],
    image_alt: ['Colourful LED strip light installed under kitchen cabinets'],
    current: { description: 'A versatile RGB LED strip light with app control.', short_description: '', yoast_title: '', yoast_metadesc: '' },
    missing_fields: ['short_description', 'yoast_title', 'yoast_metadesc'],
  },
  {
    id: 105,
    sku: 'YOGA-MAT-PRO',
    name: 'Professional Non-Slip Yoga Mat',
    permalink: 'http://localhost:9877/product/professional-yoga-mat',
    type: 'simple',
    categories: [{ name: 'Fitness', slug: 'fitness' }, { name: 'Yoga', slug: 'yoga' }],
    tags: [{ name: 'non-slip', slug: 'non-slip' }, { name: 'eco-friendly', slug: 'eco-friendly' }],
    attributes: [
      { name: 'Material', values: ['Natural Rubber', 'Polyurethane top'] },
      { name: 'Thickness', values: ['6mm'] },
      { name: 'Dimensions', values: ['183cm x 68cm'] },
    ],
    image_alt: ['Purple yoga mat rolled up on a wooden floor'],
    current: { description: '', short_description: '', yoast_title: 'Professional Yoga Mat | Non-Slip', yoast_metadesc: '' },
    missing_fields: ['description', 'short_description', 'yoast_metadesc'],
  },
  {
    id: 106,
    sku: '',
    name: 'X',
    permalink: 'http://localhost:9877/product/x',
    type: 'simple',
    categories: [],
    tags: [],
    attributes: [],
    image_alt: [],
    current: { description: '', short_description: '', yoast_title: '', yoast_metadesc: '' },
    missing_fields: ['description', 'short_description', 'yoast_title', 'yoast_metadesc'],
  },
];

const SHOPIFY_TOKEN = 'shpat_mock_demo_token';

interface ShopifyMockProduct {
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

const shopifyProducts: ShopifyMockProduct[] = [
  {
    id: 'gid://shopify/Product/8001',
    handle: 'handcrafted-ceramic-vase',
    title: 'Handcrafted Ceramic Vase',
    descriptionHtml: '',
    description: '',
    productType: 'Home Décor',
    vendor: 'Clara Mendes Studio',
    tags: ['ceramic', 'handmade', 'home-decor'],
    status: 'ACTIVE',
    seo: { title: null, description: null },
    featuredImage: { url: 'https://example.com/vase.jpg', altText: 'White ceramic vase with organic shape' },
    images: { nodes: [{ url: 'https://example.com/vase.jpg', altText: 'White ceramic vase with organic shape' }] },
    options: [{ name: 'Size', values: ['Small', 'Medium', 'Large'] }],
    collections: { nodes: [{ title: 'Home Décor', handle: 'home-decor' }, { title: 'New Arrivals', handle: 'new-arrivals' }] },
    variants: { nodes: [{ sku: 'CER-VASE-01' }] },
  },
  {
    id: 'gid://shopify/Product/8002',
    handle: 'linen-blend-throw-pillow',
    title: 'Linen Blend Throw Pillow',
    descriptionHtml: '<p>A soft linen blend pillow in muted earth tones.</p>',
    description: 'A soft linen blend pillow in muted earth tones.',
    productType: 'Textiles',
    vendor: 'Clara Mendes Studio',
    tags: ['linen', 'pillow', 'textiles'],
    status: 'ACTIVE',
    seo: { title: null, description: null },
    featuredImage: { url: 'https://example.com/pillow.jpg', altText: 'Linen throw pillow on a wooden bench' },
    images: { nodes: [{ url: 'https://example.com/pillow.jpg', altText: 'Linen throw pillow on a wooden bench' }] },
    options: [{ name: 'Colour', values: ['Sand', 'Olive', 'Charcoal'] }],
    collections: { nodes: [{ title: 'Textiles', handle: 'textiles' }] },
    variants: { nodes: [{ sku: 'LIN-PIL-02' }] },
  },
  {
    id: 'gid://shopify/Product/8003',
    handle: 'brass-candle-holder-set',
    title: 'Brass Candle Holder Set',
    descriptionHtml: '',
    description: '',
    productType: 'Home Décor',
    vendor: 'Clara Mendes Studio',
    tags: ['brass', 'candle', 'set'],
    status: 'ACTIVE',
    seo: { title: 'Brass Candle Holders — Set of 3', description: null },
    featuredImage: { url: 'https://example.com/candle.jpg', altText: 'Three brass candle holders on a marble surface' },
    images: { nodes: [{ url: 'https://example.com/candle.jpg', altText: 'Three brass candle holders on a marble surface' }] },
    options: [{ name: 'Title', values: ['Default Title'] }],
    collections: { nodes: [{ title: 'Home Décor', handle: 'home-decor' }, { title: 'Gifts', handle: 'gifts' }] },
    variants: { nodes: [{ sku: 'BRS-CND-03' }] },
  },
  {
    id: 'gid://shopify/Product/8004',
    handle: 'woven-rattan-basket',
    title: 'Woven Rattan Basket',
    descriptionHtml: '',
    description: '',
    productType: 'Storage',
    vendor: 'Clara Mendes Studio',
    tags: ['rattan', 'basket', 'storage', 'natural'],
    status: 'ACTIVE',
    seo: { title: null, description: null },
    featuredImage: null,
    images: { nodes: [] },
    options: [{ name: 'Size', values: ['Small', 'Large'] }],
    collections: { nodes: [{ title: 'Storage', handle: 'storage' }] },
    variants: { nodes: [{ sku: '' }] },
  },
];

function handleShopifyGraphQL(body: string): unknown {
  const parsed = JSON.parse(body);
  const query: string = parsed.query ?? '';
  const variables = parsed.variables ?? {};

  if (query.includes('products(')) {
    const first = Math.min(variables.first ?? 50, 250);
    const afterCursor: string | null = variables.after ?? null;
    let startIdx = 0;
    if (afterCursor) {
      const idx = shopifyProducts.findIndex((p) => p.id === afterCursor);
      startIdx = idx >= 0 ? idx + 1 : shopifyProducts.length;
    }
    const slice = shopifyProducts.slice(startIdx, startIdx + first);
    const hasMore = startIdx + first < shopifyProducts.length;
    const endCursor = slice.length > 0 ? slice[slice.length - 1]!.id : null;
    return {
      data: {
        products: {
          pageInfo: { hasNextPage: hasMore, endCursor },
          nodes: slice,
        },
      },
    };
  }

  if (query.includes('productUpdate(')) {
    const input = variables.input ?? {};
    const product = shopifyProducts.find((p) => p.id === input.id);
    if (!product) {
      return { data: { productUpdate: { product: null, userErrors: [{ field: ['id'], message: 'Product not found' }] } } };
    }
    if (input.descriptionHtml !== undefined && !product.descriptionHtml) {
      product.descriptionHtml = input.descriptionHtml;
      product.description = input.descriptionHtml.replace(/<[^>]*>/g, '');
    }
    if (input.seo) {
      if (input.seo.title !== undefined && !product.seo.title) product.seo.title = input.seo.title;
      if (input.seo.description !== undefined && !product.seo.description) product.seo.description = input.seo.description;
    }
    return { data: { productUpdate: { product: { id: product.id }, userErrors: [] } } };
  }

  return { data: null, errors: [{ message: 'Unknown query' }] };
}

const appliedUpdates = new Map<string, Record<string, string>>();

function wcAuth(req: IncomingMessage): boolean {
  const h = req.headers.authorization ?? '';
  return h === `Bearer ${MOCK_TOKEN}`;
}

function shopifyAuth(req: IncomingMessage): boolean {
  return req.headers['x-shopify-access-token'] === SHOPIFY_TOKEN;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function dashboardHtml(): string {
  const filled = products.filter((p) => p.missing_fields.length === 0).length;
  const partial = products.filter((p) => p.missing_fields.length > 0 && p.missing_fields.length < 4).length;
  const empty = products.filter((p) => p.missing_fields.length === 4).length;
  const totalFields = products.reduce((s, p) => s + 4, 0);
  const missingFields = products.reduce((s, p) => s + p.missing_fields.length, 0);
  const filledFields = totalFields - missingFields;
  const pct = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;

  const rows = products
    .map((p) => {
      const cells = ['description', 'short_description', 'yoast_title', 'yoast_metadesc']
        .map((f) => {
          const val = p.current[f] ?? '';
          const isMissing = p.missing_fields.includes(f);
          const bg = isMissing ? '#fef2f2' : '#f0fdf4';
          const color = isMissing ? '#991b1b' : '#166534';
          const label = isMissing ? 'EMPTY' : val.length > 50 ? val.slice(0, 50) + '...' : val;
          return `<td style="background:${bg};color:${color};padding:8px 10px;border:1px solid #e5e7eb;font-size:13px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${val.replace(/"/g, '&quot;')}">${label}</td>`;
        })
        .join('');
      return `<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;font-weight:500">${p.id}</td><td style="padding:8px 10px;border:1px solid #e5e7eb">${p.name}</td><td style="padding:8px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:12px">${p.sku || '—'}</td><td style="padding:8px 10px;border:1px solid #e5e7eb">${p.type}</td>${cells}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SEO Autofill — Mock Store</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#111827;padding:24px 32px}
h1{font-size:22px;margin-bottom:4px}p.sub{color:#6b7280;margin-bottom:20px;font-size:14px}
.cards{display:flex;gap:16px;margin-bottom:24px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;min-width:140px}
.card .num{font-size:28px;font-weight:700}.card .label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.bar-wrap{background:#e5e7eb;border-radius:8px;height:10px;margin-bottom:24px;overflow:hidden}.bar-fill{background:#22c55e;height:100%;border-radius:8px;transition:width .4s}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
th{background:#f3f4f6;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border:1px solid #e5e7eb}
.legend{margin-top:16px;font-size:12px;color:#6b7280}.legend span{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;margin-right:4px}
</style></head><body>
<h1>SEO Autofill — Mock Store Dashboard</h1>
<p class="sub">Simulated WooCommerce store with ${products.length} products &middot; token: <code>${MOCK_TOKEN}</code></p>
<div class="cards">
  <div class="card"><div class="num">${products.length}</div><div class="label">Products</div></div>
  <div class="card"><div class="num" style="color:#22c55e">${filled}</div><div class="label">Fully filled</div></div>
  <div class="card"><div class="num" style="color:#f59e0b">${partial}</div><div class="label">Partial</div></div>
  <div class="card"><div class="num" style="color:#ef4444">${empty}</div><div class="label">All empty</div></div>
  <div class="card"><div class="num">${pct}%</div><div class="label">Fields filled</div></div>
</div>
<div class="bar-wrap"><div class="bar-fill" style="width:${pct}%"></div></div>
<table><thead><tr><th>ID</th><th>Name</th><th>SKU</th><th>Type</th><th>Description</th><th>Short Desc</th><th>Yoast Title</th><th>Meta Desc</th></tr></thead><tbody>${rows}</tbody></table>
<div class="legend" style="margin-top:12px"><span style="background:#f0fdf4;border:1px solid #bbf7d0"></span> Filled &nbsp; <span style="background:#fef2f2;border:1px solid #fecaca"></span> Empty (will be filled by agent)</div>
<p style="margin-top:20px;font-size:13px;color:#9ca3af">Run the agent: <code>npx tsx src/index.ts run --config config.demo.json</code> then refresh this page to see fields update.</p>
</body></html>`;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(dashboardHtml());
    return;
  }

  if (req.method === 'POST' && path === '/admin/api/2025-04/graphql.json') {
    if (!shopifyAuth(req)) return json(res, 401, { errors: [{ message: 'Unauthorized' }] });
    const raw = await readBody(req);
    return json(res, 200, handleShopifyGraphQL(raw));
  }

  if (!wcAuth(req)) return json(res, 401, { code: 'unauthorized', message: 'Bad token' });

  if (req.method === 'GET' && path === '/wp-json/seo-autofill/v1/scan') {
    const page = Number(url.searchParams.get('page') ?? 1);
    const perPage = Math.min(100, Number(url.searchParams.get('per_page') ?? 50));
    const start = (page - 1) * perPage;
    const slice = products.slice(start, start + perPage);
    return json(res, 200, {
      page,
      per_page: perPage,
      total: products.length,
      total_pages: Math.ceil(products.length / perPage),
      items: slice,
    });
  }

  if (req.method === 'POST' && path === '/wp-json/seo-autofill/v1/updates/batch') {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    const runId = body.run_id ?? '';
    const dryRun = !!body.dry_run;
    const updates: unknown[] = body.updates ?? [];
    const results: unknown[] = [];
    for (const u of updates as { product_id: number; fields: Record<string, string> }[]) {
      const product = products.find((p) => p.id === u.product_id);
      if (!product) {
        results.push({ product_id: u.product_id, fields: {}, error: 'product_not_found' });
        continue;
      }
      const fieldResults: Record<string, { status: string; dry_run?: boolean; reason?: string }> = {};
      for (const [field, value] of Object.entries(u.fields)) {
        const current = product.current[field] ?? '';
        if (current.trim() !== '') {
          fieldResults[field] = { status: 'skipped', reason: 'existing_value' };
          continue;
        }
        if (dryRun) {
          fieldResults[field] = { status: 'applied', dry_run: true };
        } else {
          product.current[field] = value;
          product.missing_fields = product.missing_fields.filter((f) => f !== field);
          const key = `${runId}:${u.product_id}:${field}`;
          appliedUpdates.set(key, { previous: '', new: value });
          fieldResults[field] = { status: 'applied' };
        }
      }
      results.push({ product_id: u.product_id, fields: fieldResults });
    }
    return json(res, 200, { run_id: runId, dry_run: dryRun, results });
  }

  json(res, 404, { code: 'not_found', message: `Unknown route: ${req.method} ${path}` });
}

const port = Number(process.env.MOCK_PORT ?? 9877);
const server = createServer(handleRequest);
server.listen(port, () => {
  process.stdout.write(`Mock SEO Autofill server running at http://localhost:${port}\n`);
  process.stdout.write(`WooCommerce: token=${MOCK_TOKEN}, ${products.length} products\n`);
  process.stdout.write(`Shopify:     token=${SHOPIFY_TOKEN}, ${shopifyProducts.length} products\n`);
});
