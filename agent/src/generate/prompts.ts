import type { TargetField } from '../config.js';
import type { ScanItem } from '../scan.js';

export const PROMPT_VERSION = '2026-05-08.v1';

export interface FieldPrompt {
  system: string;
  user: string;
  maxTokens: number;
  maxChars: number;
  minChars: number;
}

const SHARED_RULES = [
  'Use only the product context provided. Do not invent materials, certifications, warranties, stock counts, prices, dimensions, or origin claims.',
  'Do not address the reader as "you" with claims about their needs. No clickbait. No emojis.',
  'Plain prose only — no markdown, no HTML, no bullet points unless explicitly required by the field.',
  'Never repeat the SKU verbatim and never echo the product name as the entire output.',
  'British English unless the product context clearly uses American English.',
].join('\n- ');

function contextBlock(item: ScanItem): string {
  const cats = item.categories.map((c) => c.name).filter(Boolean).join(', ') || '(none)';
  const tags = item.tags.map((t) => t.name).filter(Boolean).join(', ') || '(none)';
  const attrs =
    item.attributes
      .map((a) => `${a.name}: ${a.values.join(', ')}`)
      .filter(Boolean)
      .join(' | ') || '(none)';
  const alts = item.image_alt.filter(Boolean).join(' | ') || '(none)';
  const existingDesc = item.current.description?.trim() || '(empty)';
  const existingShort = item.current.short_description?.trim() || '(empty)';
  return [
    `Product name: ${item.name}`,
    `SKU: ${item.sku || '(none)'}`,
    `Type: ${item.type}`,
    `Categories: ${cats}`,
    `Tags: ${tags}`,
    `Attributes: ${attrs}`,
    `Image alt text: ${alts}`,
    `Existing long description: ${existingDesc}`,
    `Existing short description: ${existingShort}`,
  ].join('\n');
}

const FIELD_RULES: Record<TargetField, { system: string; instruction: string; maxChars: number; minChars: number; maxTokens: number }> = {
  description: {
    system: `You write WooCommerce long product descriptions. Rules:\n- ${SHARED_RULES}\n- Length: 2 to 4 short paragraphs, 80 to 220 words total.\n- Cover what the product is, who it suits based on its categories and attributes, and one or two concrete features that are visible in the context.`,
    instruction: 'Write the long description as plain text only. Output the description and nothing else.',
    maxChars: 1800,
    minChars: 200,
    maxTokens: 600,
  },
  short_description: {
    system: `You write WooCommerce short product summaries (the "excerpt"). Rules:\n- ${SHARED_RULES}\n- Length: 1 to 2 sentences, 25 to 50 words.\n- Read as a tight blurb that could appear above a buy button.`,
    instruction: 'Write the short description as plain text only. Output the short description and nothing else.',
    maxChars: 320,
    minChars: 60,
    maxTokens: 180,
  },
  yoast_title: {
    system: `You write Yoast SEO meta titles. Rules:\n- ${SHARED_RULES}\n- Maximum 60 characters including spaces. Hard limit.\n- Lead with the most specific differentiator from the context.\n- Do not include the site name; Yoast appends it.`,
    instruction: 'Output only the title text, no quotes, no trailing punctuation.',
    maxChars: 60,
    minChars: 15,
    maxTokens: 60,
  },
  yoast_metadesc: {
    system: `You write Yoast SEO meta descriptions. Rules:\n- ${SHARED_RULES}\n- 130 to 155 characters including spaces. Hard upper bound 155.\n- One sentence preferred, two short ones acceptable. End with a period.`,
    instruction: 'Output only the meta description text, no quotes.',
    maxChars: 155,
    minChars: 110,
    maxTokens: 120,
  },
  seo_title: {
    system: `You write Shopify SEO meta titles. Rules:\n- ${SHARED_RULES}\n- Maximum 60 characters including spaces. Hard limit.\n- Lead with the most specific differentiator from the context.\n- Do not include the store name; Shopify appends it.`,
    instruction: 'Output only the title text, no quotes, no trailing punctuation.',
    maxChars: 60,
    minChars: 15,
    maxTokens: 60,
  },
  seo_description: {
    system: `You write Shopify SEO meta descriptions. Rules:\n- ${SHARED_RULES}\n- 130 to 155 characters including spaces. Hard upper bound 155.\n- One sentence preferred, two short ones acceptable. End with a period.`,
    instruction: 'Output only the meta description text, no quotes.',
    maxChars: 155,
    minChars: 110,
    maxTokens: 120,
  },
};

export function buildPrompt(field: TargetField, item: ScanItem): FieldPrompt {
  const rules = FIELD_RULES[field];
  return {
    system: rules.system,
    user: `Product context:\n${contextBlock(item)}\n\nTask: ${rules.instruction}`,
    maxTokens: rules.maxTokens,
    maxChars: rules.maxChars,
    minChars: rules.minChars,
  };
}
