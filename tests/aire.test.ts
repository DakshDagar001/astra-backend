import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aireEngine } from '../src/routing/AIRE/aire-engine.js';
import { routingRepository } from '../src/database/repositories/routing.repository.js';
import { providerRegistry } from '../src/providers/registry/provider.registry.js';
import { healthRepository } from '../src/database/repositories/health.repository.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/utils/errors.js';

describe('AIRE — Astra Intelligent Routing Engine & 14 Fallback Test Scenarios (Mocked)', () => {
  const dummyContext = {
    correlationId: 'test-aire-correlation-123',
    sessionId: 'test-session-1',
    clientType: 'windows',
  };

  const sampleImage = {
    mimeType: 'image/png',
    dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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

  // 1. Primary provider succeeds
  it('Scenario 1: Primary provider succeeds', async () => {
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
    expect(result.fallbackOccurred).toBe(false);
    expect(result.attemptsCount).toBe(1);
  });

  // 2. Primary provider returns rate limit
  it('Scenario 2: Primary provider returns rate limit (429)', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Rate limit exceeded', 'RATE_LIMITED', 429, 60)
    );
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
    expect(result.fallbackOccurred).toBe(true);
    expect(result.attemptsCount).toBe(2);
  });

  // 3. Primary provider times out
  it('Scenario 3: Primary provider times out (504)', async () => {
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
        requestId: 'req-3',
        prompt: 'Generate code',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
  });

  // 4. Primary provider is unavailable
  it('Scenario 4: Primary provider is unavailable (503)', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('OpenAI outage in progress', 'PROVIDER_UNAVAILABLE', 503)
    );
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Gemini answered during OpenAI outage',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-4',
        prompt: 'Quick calculation',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
  });

  // 5. Primary model is unavailable
  it('Scenario 5: Primary model is unavailable', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Model gpt-4o-mini currently decommissioned', 'MODEL_UNAVAILABLE', 503)
    );
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Fallback response from Gemini 2.5 Flash',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-5',
        prompt: 'Explain gravity',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
  });

  // 6. Secondary provider succeeds
  it('Scenario 6: Secondary provider succeeds after primary quota exhaustion', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Monthly quota reached', 'QUOTA_EXHAUSTED', 429)
    );
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Secondary Gemini handled quota exhaustion perfectly',
      model: 'gemini-2.5-flash',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-6',
        prompt: 'Write an email',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
    expect(result.attemptsCount).toBe(2);
  });

  // 7. All providers fail
  it('Scenario 7: All providers fail and exhaust retry attempts', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;
    const groq = providerRegistry.getProvider('groq')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('OpenAI down', 'PROVIDER_SERVER_ERROR', 500)
    );
    vi.spyOn(gemini, 'executeRequest').mockRejectedValueOnce(
      new AppError('Gemini down', 'PROVIDER_SERVER_ERROR', 500)
    );
    vi.spyOn(groq, 'executeRequest').mockRejectedValueOnce(
      new AppError('Groq down', 'PROVIDER_SERVER_ERROR', 500)
    );

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-all-fail',
          prompt: 'Hello',
          modelIdentifier: '',
        },
        dummyContext
      )
    ).rejects.toThrow();
  });

  // 8. Invalid credentials (must NOT fallback)
  it('Scenario 8: Invalid credentials does NOT trigger fallback', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Incorrect API key provided', 'INVALID_PROVIDER_CREDENTIALS', 401)
    );
    const geminiSpy = vi.spyOn(gemini, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-bad-cred',
          prompt: 'Hello',
          modelIdentifier: 'openai:gpt-4o-mini',
        },
        dummyContext
      )
    ).rejects.toThrow('Incorrect API key provided');

    // Never try next provider on invalid credentials
    expect(geminiSpy).not.toHaveBeenCalled();
  });

  // 9. Invalid input (must NOT fallback)
  it('Scenario 9: Invalid input does NOT trigger fallback', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    const openaiSpy = vi.spyOn(openai, 'executeRequest');
    const geminiSpy = vi.spyOn(gemini, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-bad-input',
          prompt: '', // empty prompt
          modelIdentifier: 'openai:gpt-4o-mini',
        },
        dummyContext
      )
    ).rejects.toThrow('Prompt is required and must not be empty');

    expect(openaiSpy).not.toHaveBeenCalled();
    expect(geminiSpy).not.toHaveBeenCalled();
  });

  // 10. Vision fallback
  it('Scenario 10: Vision fallback preserves images and routes to eligible vision model', async () => {
    await routingRepository.updateConfig({
      visionPriorityModels: ['gemini:gemini-2.5-flash', 'openai:gpt-4o-mini'],
    });

    const gemini = providerRegistry.getProvider('gemini')!;
    const openai = providerRegistry.getProvider('openai')!;

    // Gemini vision fails with rate limit
    vi.spyOn(gemini, 'executeRequest').mockRejectedValueOnce(
      new AppError('Gemini vision rate limit', 'RATE_LIMITED', 429)
    );

    // OpenAI vision succeeds
    const openaiSpy = vi.spyOn(openai, 'executeRequest').mockResolvedValueOnce({
      text: 'OpenAI successfully analyzed the screenshot',
      model: 'gpt-4o-mini',
    });

    const result = await aireEngine.processRequest(
      {
        requestId: 'req-vision-fb',
        prompt: 'Solve this equation from screenshot',
        modelIdentifier: '',
        images: [sampleImage],
      },
      dummyContext
    );

    expect(result.response.text).toBe('OpenAI successfully analyzed the screenshot');
    expect(result.actualProvider).toBe('openai');
    expect(result.fallbackOccurred).toBe(true);

    // Verify original image data was passed intact
    expect(openaiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([expect.objectContaining({ mimeType: 'image/png' })]),
      })
    );
  });

  // 11. Streaming failure before first token
  it('Scenario 11: Streaming failure before first token triggers safe fallback', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeStreamingRequest').mockRejectedValueOnce(
      new AppError('Connection dropped before first token', 'NETWORK_ERROR', 502)
    );

    vi.spyOn(gemini, 'executeStreamingRequest').mockImplementationOnce(
      async (_req, onChunk) => {
        onChunk('Chunk 1 from Gemini');
        onChunk('Chunk 2 from Gemini');
        return {
          text: 'Chunk 1 from GeminiChunk 2 from Gemini',
          model: 'gemini-2.5-flash',
        };
      }
    );

    const receivedChunks: string[] = [];
    const result = await aireEngine.processStreamingRequest(
      {
        requestId: 'req-stream-fb',
        prompt: 'Stream test',
        modelIdentifier: 'openai:gpt-4o-mini',
      },
      dummyContext,
      {
        onStart: vi.fn(),
        onChunk: (chunk) => receivedChunks.push(chunk),
      }
    );

    expect(result.actualProvider).toBe('gemini');
    expect(result.fallbackOccurred).toBe(true);
    expect(receivedChunks.length).toBe(2);
  });

  // 12. Streaming failure after first token (must NOT switch providers)
  it('Scenario 12: Streaming failure after first token prohibits provider switching', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeStreamingRequest').mockImplementationOnce(
      async (_req, onChunk) => {
        onChunk('First token emitted from OpenAI');
        throw new AppError('Socket disconnected mid-stream', 'NETWORK_ERROR', 502);
      }
    );

    const geminiSpy = vi.spyOn(gemini, 'executeStreamingRequest');

    await expect(
      aireEngine.processStreamingRequest(
        {
          requestId: 'req-stream-fail-mid',
          prompt: 'Stream test',
          modelIdentifier: 'openai:gpt-4o-mini',
        },
        dummyContext,
        {
          onStart: vi.fn(),
          onChunk: vi.fn(),
        }
      )
    ).rejects.toThrow('Socket disconnected mid-stream');

    // Never switch providers after client has received partial response!
    expect(geminiSpy).not.toHaveBeenCalled();
  });

  // 13. User cancellation
  it('Scenario 13: User cancellation aborts request without fallback', async () => {
    const controller = new AbortController();
    controller.abort(); // Cancel immediately

    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    vi.spyOn(openai, 'executeRequest').mockImplementationOnce(async (req) => {
      if (req.abortSignal?.aborted) {
        throw new AppError('The operation was aborted', 'UNKNOWN_ERROR', 499);
      }
      return { text: 'ok', model: 'gpt-4o-mini' };
    });

    const geminiSpy = vi.spyOn(gemini, 'executeRequest');

    await expect(
      aireEngine.processRequest(
        {
          requestId: 'req-cancel',
          prompt: 'Calculate something slow',
          modelIdentifier: 'openai:gpt-4o-mini',
          abortSignal: controller.signal,
        },
        dummyContext
      )
    ).rejects.toThrow('The operation was aborted');

    expect(geminiSpy).not.toHaveBeenCalled();
  });

  // 14. Provider cooldown
  it('Scenario 14: Provider cooldown ensures impaired models are bypassed on subsequent requests', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    const gemini = providerRegistry.getProvider('gemini')!;

    // Request 1: OpenAI fails with 429, enters cooldown, Gemini succeeds
    vi.spyOn(openai, 'executeRequest').mockRejectedValueOnce(
      new AppError('Rate limit exceeded', 'RATE_LIMITED', 429, 60)
    );
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Response from Gemini',
      model: 'gemini-2.5-flash',
    });

    await aireEngine.processRequest(
      {
        requestId: 'req-cd-1',
        prompt: 'First prompt',
        modelIdentifier: '',
      },
      dummyContext
    );

    // Request 2: Because OpenAI is in cooldown, AIRE must immediately route to Gemini on Attempt 1
    const openaiSpy2 = vi.spyOn(openai, 'executeRequest');
    vi.spyOn(gemini, 'executeRequest').mockResolvedValueOnce({
      text: 'Response from Gemini without attempting OpenAI',
      model: 'gemini-2.5-flash',
    });

    const result2 = await aireEngine.processRequest(
      {
        requestId: 'req-cd-2',
        prompt: 'Second prompt',
        modelIdentifier: '',
      },
      dummyContext
    );

    expect(openaiSpy2).not.toHaveBeenCalled();
    expect(result2.actualProvider).toBe('gemini');
    expect(result2.fallbackOccurred).toBe(false); // First attempted model succeeded directly!
  });
});
