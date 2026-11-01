import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aireEngine } from '../src/routing/AIRE/aire-engine.js';
import { routingRepository } from '../src/database/repositories/routing.repository.js';
import { providerRegistry } from '../src/providers/registry/provider.registry.js';
import { healthRepository } from '../src/database/repositories/health.repository.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/utils/errors.js';

describe('AIRE — Astra Intelligent Routing Engine & Intelligent Failover', () => {
  const dummyContext = {
    correlationId: 'test-aire-correlation-123',
    sessionId: 'test-session-1',
    clientType: 'windows',
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    (env as any).OPENAI_API_KEY = 'mock-key-openai';
    (env as any).GEMINI_API_KEY = 'mock-key-gemini';
    (env as any).GROQ_API_KEY = 'mock-key-groq';

    // Reset routing config to default
    await routingRepository.updateConfig({
      mode: 'automatic',
      pinnedModelId: null,
      fallbackEnabled: true,
      maxAttempts: 3,
      textPriorityModels: ['openai:gpt-4o-mini', 'gemini:gemini-2.5-flash', 'groq:llama-3.3-70b'],
      visionPriorityModels: ['gemini:gemini-2.5-flash', 'openai:gpt-4o-mini'],
    });

    // Clear any active cooldowns
    const records = await healthRepository.getAllRecords();
    for (const r of records) {
      await healthRepository.setRecord({
        ...r,
        status: 'AVAILABLE',
        cooldownUntil: null,
        failureCount: 0,
      });
    }
  });

  it('successfully routes to primary model when available', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    vi.spyOn(openai, 'executeRequest').mockResolvedValueOnce({
      text: 'Hello from primary OpenAI model',
      model: 'gpt-4o-mini',
      usage: { totalTokens: 42 },
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-1',
        prompt: 'Hi Astra',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.response.text).toBe('Hello from primary OpenAI model');
    expect(result.actualProvider).toBe('openai');
    expect(result.actualModel).toBe('openai:gpt-4o-mini');
    expect(result.fallbackOccurred).toBe(false);
    expect(result.attemptsCount).toBe(1);
  });

  it('falls back to secondary model when primary is rate limited (429)', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    // OpenAI throws 429 Rate Limit
    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Rate limit exceeded', 'RATE_LIMITED', 429, 60)
    );

    // Gemini succeeds
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Response from fallback Gemini',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-2',
        prompt: 'Summarize text',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.response.text).toBe('Response from fallback Gemini');
    expect(result.actualProvider).toBe('gemini');
    expect(result.actualModel).toBe('gemini:gemini-2.5-flash');
    expect(result.fallbackOccurred).toBe(true);
    expect(result.attemptsCount).toBe(2);
  });

  it('falls back when primary provider exhausts quota', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Quota exhausted for current billing cycle', 'QUOTA_EXHAUSTED', 429)
    );

    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Response from Gemini after OpenAI quota exhaustion',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-3',
        prompt: 'Query',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
  });

  it('falls back on provider timeout or server error', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Request timed out after 30000ms', 'TIMEOUT', 504)
    );

    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Gemini handled request after timeout',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-4',
        prompt: 'Generate code',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
  });

  it('skips models that do not support vision when images are present', async () => {
    // Configure text priority models that include groq:llama-3.3-70b (text-only)
    await routingRepository.updateConfig({
      visionPriorityModels: ['gemini:gemini-2.5-flash', 'openai:gpt-4o-mini'],
    });

    const gemini = providerRegistry.getProvider('gemini')!;
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Image analysis complete',
      model: 'gemini-2.5-flash',
    });

    // Provide base64 1x1 png image
    const sampleImage = {
      mimeType: 'image/png',
      dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-vision-1',
        prompt: 'Describe this screenshot',
        modelIdentifier: '',
        images: [sampleImage],
      },
      dummyContext
    );

    expect(result.response.text).toBe('Image analysis complete');
    expect(result.actualProvider).toBe('gemini');
  });

  it('DOES NOT fallback when request is invalid (invalid input)', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    const openaiSpy = vi.spyOn(openai, 'executeRequest');
    const geminiSpy = vi.spyOn(gemini, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-bad-1',
          prompt: '', // empty prompt
          modelIdentifier: 'openai:gpt-4o-mini',
        },
        dummyContext
      )
    ).rejects.toThrow('Prompt is required and must not be empty');

    expect(openaiSpy).not.toHaveBeenCalled();
    expect(geminiSpy).not.toHaveBeenCalled();
  });

  it('DOES NOT fallback when provider issues a content policy refusal', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Request declined by provider content safety policy', 'CONTENT_POLICY_REFUSAL', 400)
    );

    const geminiSpy = vi.spyOn(gemini, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-safety-1',
          prompt: 'unsafe prompt',
          modelIdentifier: 'openai:gpt-4o-mini',
        },
        dummyContext
      )
    ).rejects.toThrow('Request declined by provider content safety policy');

    // Crucial safety rule: AIRE must NOT attempt other providers to circumvent content policies
    expect(geminiSpy).not.toHaveBeenCalled();
  });

  it('enforces maximum attempts limit', async () => {
    await routingRepository.updateConfig({ maxAttempts: 2 });

    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;
    const groq = providerRegistry.getProvider('groq')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('OpenAI server error', 'PROVIDER_SERVER_ERROR', 500)
    );
    vi.spyOn(gemini, 'executeRequest').mockRejectedValueOnce(
      new AppError('Gemini server error', 'PROVIDER_SERVER_ERROR', 500)
    );
    const groqSpy = vi.spyOn(groq, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-max-attempts',
          prompt: 'Hello',
          modelIdentifier: '',
        },
        dummyContext
      )
    ).rejects.toThrow();

    // Max attempts was 2, so groq (attempt 3) must NOT have been called
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('respects manual model pinning without fallback when fallback is disabled', async () => {
    await routingRepository.updateConfig({
      mode: 'manual',
      pinnedModelId: 'groq:llama-3.3-70b',
      fallbackEnabled: false,
    });

    const groq = providerRegistry.getProvider('groq')!;
    const openai = providerRegistry.getProvider('openai')!;

    vi.spyOn(groq, 'executeRequest').mockRejectedValueOnce(
      new AppError('Groq temporarily unavailable', 'PROVIDER_UNAVAILABLE', 503)
    );
    const openaiSpy = vi.spyOn(openai, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-pinned',
          prompt: 'Hello pinned',
          modelIdentifier: 'groq:llama-3.3-70b',
        },
        dummyContext
      )
    ).rejects.toThrow();

    expect(openaiSpy).not.toHaveBeenCalled();
  });
});
