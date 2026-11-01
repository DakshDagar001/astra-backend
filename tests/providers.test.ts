import { describe, it, expect, beforeEach } from 'vitest';
import { providerRegistry } from '../src/providers/registry/provider.registry.js';
import { modelRegistry } from '../src/models/model.registry.js';
import { env } from '../src/config/env.js';

describe('AI Provider Ecosystem & Model Registry', () => {
  beforeEach(() => {
    (env as any).OPENAI_API_KEY = undefined;
    (env as any).GEMINI_API_KEY = undefined;
    (env as any).OPENROUTER_API_KEY = undefined;
    (env as any).GROQ_API_KEY = undefined;
    (env as any).HUGGINGFACE_API_KEY = undefined;
    (env as any).NVIDIA_NIM_API_KEY = undefined;
    (env as any).TOGETHER_API_KEY = undefined;
    (env as any).DEEPINFRA_API_KEY = undefined;
  });

  it('registers all 8 required AI providers', () => {
    const providers = providerRegistry.listProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('gemini');
    expect(ids).toContain('openrouter');
    expect(ids).toContain('groq');
    expect(ids).toContain('huggingface');
    expect(ids).toContain('nvidia');
    expect(ids).toContain('together');
    expect(ids).toContain('deepinfra');
  });

  it('marks providers as unconfigured when API keys are absent', () => {
    const providers = providerRegistry.listProviders();
    for (const p of providers) {
      expect(p.isConfigured).toBe(false);
    }
  });

  it('marks provider as configured when API key is provided', () => {
    (env as any).OPENAI_API_KEY = 'sk-mock-test-key';
    const openai = providerRegistry.getProvider('openai');
    expect(openai).toBeDefined();
    expect(openai!.getProviderMetadata().isConfigured).toBe(true);
    expect(openai!.validateConfiguration().isConfigured).toBe(true);
  });

  it('accurately specifies text and vision capabilities for models', async () => {
    const models = await modelRegistry.listModels();
    expect(models.length).toBeGreaterThan(0);

    const gpt4oMini = models.find((m) => m.id === 'openai:gpt-4o-mini');
    expect(gpt4oMini).toBeDefined();
    expect(gpt4oMini!.supportsText).toBe(true);
    expect(gpt4oMini!.supportsVision).toBe(true);

    const llamaGroqText = models.find((m) => m.id === 'groq:llama-3.3-70b');
    expect(llamaGroqText).toBeDefined();
    expect(llamaGroqText!.supportsText).toBe(true);
    expect(llamaGroqText!.supportsVision).toBe(false);

    const llamaGroqVision = models.find((m) => m.id === 'groq:llama-3.2-11b-vision');
    expect(llamaGroqVision).toBeDefined();
    expect(llamaGroqVision!.supportsVision).toBe(true);
  });

  it('does not expose API keys in provider or model metadata', async () => {
    (env as any).GEMINI_API_KEY = 'secret-gemini-key-12345';
    const providers = providerRegistry.listProviders();
    const gemini = providers.find((p) => p.id === 'gemini');

    expect(gemini).toBeDefined();
    expect(JSON.stringify(gemini)).not.toContain('secret-gemini-key-12345');

    const models = await modelRegistry.listModels();
    expect(JSON.stringify(models)).not.toContain('secret-gemini-key-12345');
  });
});
