import { env } from '../../config/env.js';
import type { AnalysisMode, ProviderName } from '../../types/analysis.js';
import type { AIProvider } from './AIProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { LocalProvider } from './LocalProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

/** 'auto' uses an external provider when one is configured; 'local' always stays offline. */
export type RequestedMode = 'auto' | 'local';

const localProvider = new LocalProvider();

function configuredExternalProvider(): AIProvider | null {
  const { AI_PROVIDER, AI_TIMEOUT_MS } = env;
  if (AI_PROVIDER === 'local') return null;
  const openai = env.openaiApiKey ? new OpenAIProvider(env.openaiApiKey, env.OPENAI_MODEL, AI_TIMEOUT_MS) : null;
  const gemini = env.geminiApiKey ? new GeminiProvider(env.geminiApiKey, env.GEMINI_MODEL, AI_TIMEOUT_MS) : null;
  if (AI_PROVIDER === 'openai') return openai;
  if (AI_PROVIDER === 'gemini') return gemini;
  return openai ?? gemini;
}

/** Select the provider for an analysis. Without API keys this is always the LocalProvider. */
export function resolveProvider(requested: RequestedMode = 'auto'): AIProvider {
  if (requested === 'local') return localProvider;
  return configuredExternalProvider() ?? localProvider;
}

export interface AIStatus {
  mode: AnalysisMode;
  label: string;
  provider: ProviderName;
  model: string | null;
  providers: {
    openai: { configured: boolean; model: string };
    gemini: { configured: boolean; model: string };
  };
  setting: typeof env.AI_PROVIDER;
}

/** Public status used by the UI ("Analysis Mode: Local" / "AI Enhanced"). Never exposes keys. */
export function getAIStatus(): AIStatus {
  const provider = resolveProvider('auto');
  return {
    mode: provider.isExternal ? 'AI_ENHANCED' : 'LOCAL',
    label: provider.isExternal ? 'AI Enhanced' : 'Local',
    provider: provider.name,
    model: provider.model,
    providers: {
      openai: { configured: !!env.openaiApiKey, model: env.OPENAI_MODEL },
      gemini: { configured: !!env.geminiApiKey, model: env.GEMINI_MODEL },
    },
    setting: env.AI_PROVIDER,
  };
}
