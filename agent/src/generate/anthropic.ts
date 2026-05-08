import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, GenerateOpts } from './index.js';

export function createAnthropicProvider(model: string, apiKey: string | undefined): LlmProvider {
  if (!apiKey) throw new Error('Anthropic API key is required when provider=anthropic.');
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',
    model,
    async generate(opts: GenerateOpts): Promise<string> {
      const res = await client.messages.create({
        model,
        max_tokens: opts.maxTokens,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: opts.user }],
      });

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return text;
    },
  };
}
