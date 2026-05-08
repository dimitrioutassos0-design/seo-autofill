# SEO Autofill

Multi-platform SEO autofill agent that fills missing product descriptions and SEO metadata across WooCommerce and Shopify stores using LLMs (Anthropic Claude or OpenAI).

## Layout

- `plugin/` — WordPress plugin exposing safe scan/update/rollback REST endpoints for WooCommerce + Yoast SEO.
- `agent/` — Node.js + TypeScript agent with a web dashboard. Scans stores, generates copy with an LLM, validates, and batch-writes.

## Supported platforms

| Platform | Fields | Auth |
|---|---|---|
| **WooCommerce + Yoast** | description, short_description, yoast_title, yoast_metadesc | Bearer token or WP Application Password |
| **Shopify** | description (HTML), seo_title, seo_description | Admin API access token (`shpat_*`) |

## Quick start

```bash
cd agent && npm install
```

### Demo (no store needed)

```bash
# Start mock server (simulates both WC and Shopify stores)
npx tsx src/mock-server.ts &

# Run the agent against mock stores
npx tsx src/index.ts run --config config.demo.json

# Or launch the web dashboard
npx tsx src/index.ts dashboard --config config.demo.json --port 3200
```

### Production

1. **WooCommerce**: Install `plugin/` on each target store, generate a token in the admin page.
2. **Shopify**: Create a custom app with `write_products` scope and get the Admin API access token.
3. Copy and edit the config:
   ```bash
   cp config.example.json config.json
   ```
4. Preview with dry run:
   ```bash
   npx tsx src/index.ts run --dry-run
   ```
5. Apply:
   ```bash
   npx tsx src/index.ts run --no-dry-run
   ```

## Web dashboard

```bash
npx tsx src/index.ts dashboard --config config.json --port 3200
```

The dashboard provides:
- **Overview** — store list with product counts, missing field stats, and coverage bars
- **Products** — browse products per store, filter by missing/filled, see all SEO fields
- **Run Agent** — trigger runs (dry or live) with store and limit filters
- **Reports** — view past run results with per-product detail

## Safety invariants

1. The plugin checks field emptiness server-side. The agent never decides on its own that a field is "really empty."
2. Every write is preceded by a rollback row (WooCommerce). `runId` is always propagated.
3. `dryRun: true` is the default. A real run requires explicit opt-in.
4. The agent only reads product data; never customer or order data.
5. Secrets are read from env or local config; never written to reports or logs.
6. Generated text is validated for length, placeholders, banned claims, and duplicates before writing.

## Config

See `agent/config.example.json` for the full schema. Key fields:

```jsonc
{
  "stores": [
    { "id": "my-wc", "platform": "woocommerce", "baseUrl": "https://...", "auth": { "type": "token", "value": "..." } },
    { "id": "my-shopify", "platform": "shopify", "storeDomain": "mystore.myshopify.com", "auth": { "type": "shopify_admin", "accessToken": "shpat_..." } }
  ],
  "provider": "anthropic",       // or "openai"
  "model": "claude-sonnet-4-6",  // or "gpt-4o", or "demo" for offline testing
  "dryRun": true
}
```

Environment variable overrides: `SEO_AUTOFILL_ANTHROPIC_KEY`, `SEO_AUTOFILL_OPENAI_KEY`, `SEO_AUTOFILL_DRY_RUN`.
