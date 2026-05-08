import type { LlmProvider, GenerateOpts } from './index.js';

const CANNED: Record<string, (name: string) => string> = {
  description: (name) =>
    `The ${name} combines thoughtful design with everyday practicality. Built from carefully selected materials, it sits comfortably within its category and suits both newcomers and experienced users alike.\n\nKey details are visible at a glance: well-considered dimensions, a finish that complements most settings, and construction that prioritises longevity. Whether placed in a home or professional environment, the ${name} does its job without demanding attention.`,
  short_description: (name) =>
    `A well-crafted ${name.toLowerCase()} designed for daily use, blending quality materials with a clean, functional profile.`,
  yoast_title: (name) => {
    const base = name.length <= 45 ? `${name} — Quality & Design` : name;
    return base.slice(0, 60);
  },
  yoast_metadesc: (name) =>
    `Discover the ${name.toLowerCase()}. Thoughtfully made from quality materials, designed for comfort and durability in any setting.`.slice(0, 155),
};

export function createDemoProvider(): LlmProvider {
  return {
    name: 'anthropic',
    model: 'demo',
    async generate(opts: GenerateOpts): Promise<string> {
      const nameMatch = opts.user.match(/Product name:\s*(.+)/);
      const name = nameMatch?.[1]?.trim() ?? 'Product';

      const fieldHint =
        opts.system.includes('long product descriptions') ? 'description'
        : opts.system.includes('short product summaries') ? 'short_description'
        : opts.system.includes('meta titles') ? 'yoast_title'
        : 'yoast_metadesc';

      const fn = CANNED[fieldHint] ?? CANNED['yoast_metadesc']!;
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
      return fn(name);
    },
  };
}
