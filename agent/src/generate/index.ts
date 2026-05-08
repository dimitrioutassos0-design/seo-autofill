import type { Config, TargetField } from '../config.js';
import type { ScanItem } from '../scan.js';
import { buildPrompt, PROMPT_VERSION } from './prompts.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAIProvider } from './openai.js';
import { createDemoProvider } from './demo.js';

export interface GenerateOpts {
  system: string;
  user: string;
  maxTokens: number;
}

export interface LlmProvider {
  name: 'anthropic' | 'openai';
  model: string;
  generate(opts: GenerateOpts): Promise<string>;
}

export interface GenerationResult {
  field: TargetField;
  text: string;
  model: string;
  promptVersion: string;
  maxChars: number;
  minChars: number;
}

export function createProvider(cfg: Config): LlmProvider {
  if (cfg.model === 'demo') return createDemoProvider();
  switch (cfg.provider) {
    case 'anthropic':
      return createAnthropicProvider(cfg.model, cfg.apiKeys.anthropic);
    case 'openai':
      return createOpenAIProvider(cfg.model, cfg.apiKeys.openai);
  }
}

export async function generateField(
  provider: LlmProvider,
  field: TargetField,
  item: ScanItem,
): Promise<GenerationResult> {
  const prompt = buildPrompt(field, item);
  const text = await provider.generate({
    system: prompt.system,
    user: prompt.user,
    maxTokens: prompt.maxTokens,
  });
  return {
    field,
    text: text.replace(/^["']|["']$/g, '').trim(),
    model: provider.model,
    promptVersion: PROMPT_VERSION,
    maxChars: prompt.maxChars,
    minChars: prompt.minChars,
  };
}
