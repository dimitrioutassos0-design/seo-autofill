import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

export const WC_FIELDS = ['description', 'short_description', 'yoast_title', 'yoast_metadesc'] as const;
export const SHOPIFY_FIELDS = ['description', 'seo_title', 'seo_description'] as const;
export const ALL_TARGET_FIELDS = [...WC_FIELDS, ...SHOPIFY_FIELDS] as const;

export type WcField = (typeof WC_FIELDS)[number];
export type ShopifyField = (typeof SHOPIFY_FIELDS)[number];
export type TargetField = WcField | ShopifyField;

export function fieldsForPlatform(platform: Platform): readonly TargetField[] {
  return platform === 'shopify' ? SHOPIFY_FIELDS : WC_FIELDS;
}

const WcAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), value: z.string().min(8) }),
  z.object({ type: z.literal('app_password'), username: z.string().min(1), value: z.string().min(8) }),
]);

const ShopifyAuthSchema = z.object({
  type: z.literal('shopify_admin'),
  accessToken: z.string().min(8),
});

const PlatformSchema = z.enum(['woocommerce', 'shopify']);
export type Platform = z.infer<typeof PlatformSchema>;

const WcStoreSchema = z.object({
  id: z.string().min(1),
  platform: z.literal('woocommerce').default('woocommerce'),
  baseUrl: z.string().url(),
  auth: WcAuthSchema,
  batchSize: z.number().int().min(1).max(100).default(20),
  rps: z.number().positive().default(2),
  concurrency: z.number().int().min(1).max(16).default(2),
  statuses: z.array(z.string()).default(['publish', 'draft']),
});

const ShopifyStoreSchema = z.object({
  id: z.string().min(1),
  platform: z.literal('shopify'),
  storeDomain: z.string().min(3),
  auth: ShopifyAuthSchema,
  batchSize: z.number().int().min(1).max(100).default(20),
  rps: z.number().positive().default(2),
  concurrency: z.number().int().min(1).max(16).default(2),
  statuses: z.array(z.string()).default(['ACTIVE', 'DRAFT']),
});

const StoreSchema = z.discriminatedUnion('platform', [WcStoreSchema, ShopifyStoreSchema]);

const ProviderSchema = z.enum(['anthropic', 'openai']);

export const ConfigSchema = z.object({
  stores: z.array(StoreSchema).min(1),
  provider: ProviderSchema.default('anthropic'),
  model: z.string().default('claude-sonnet-4-6'),
  dryRun: z.boolean().default(true),
  reportsDir: z.string().default('./reports'),
  minSignalChars: z.number().int().min(0).default(20),
  apiKeys: z
    .object({
      anthropic: z.string().optional(),
      openai: z.string().optional(),
    })
    .default({}),
});

export type WcStore = z.infer<typeof WcStoreSchema>;
export type ShopifyStore = z.infer<typeof ShopifyStoreSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path = './config.json'): Promise<Config> {
  const abs = resolve(process.cwd(), path);
  const raw = await readFile(abs, 'utf8');
  const parsed = ConfigSchema.parse(JSON.parse(raw));

  const apiKeys = {
    anthropic: process.env.SEO_AUTOFILL_ANTHROPIC_KEY ?? parsed.apiKeys.anthropic,
    openai: process.env.SEO_AUTOFILL_OPENAI_KEY ?? parsed.apiKeys.openai,
  };

  const dryRunEnv = process.env.SEO_AUTOFILL_DRY_RUN;
  const dryRun = dryRunEnv === undefined ? parsed.dryRun : dryRunEnv !== 'false';

  return { ...parsed, apiKeys, dryRun };
}

export function redactSecrets(cfg: Config): Config {
  const stars = '***';
  return {
    ...cfg,
    apiKeys: {
      anthropic: cfg.apiKeys.anthropic ? stars : undefined,
      openai: cfg.apiKeys.openai ? stars : undefined,
    },
    stores: cfg.stores.map((s) => {
      if (s.platform === 'shopify') {
        return { ...s, auth: { ...s.auth, accessToken: stars } };
      }
      return { ...s, auth: { ...s.auth, value: stars } as WcStore['auth'] };
    }),
  };
}
