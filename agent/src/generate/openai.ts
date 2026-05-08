import OpenAI from 'openai';
import type { LlmProvider, GenerateOpts } from './index.js';

export function createOpenAIProvider(model: string, apiKey: string | undefined): LlmProvider {
  if (!apiKey) throw new Error('OpenAI API key is required when provider=openai.');
  const client = new OpenAI({ apiKey });

  return {
    name: 'openai',
    model,
    async generate(opts: GenerateOpts): Promise<string> {
      const res = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens,
        temperature: 0.4,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      });
      return (res.choices[0]?.message?.content ?? '').trim();
    },
  };
}
