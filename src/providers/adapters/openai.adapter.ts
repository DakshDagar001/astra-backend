import { BaseProviderAdapter } from './base.adapter.js';
import {
  AIModelMetadata,
  AIExecuteRequest,
  AIExecuteResponse,
} from '../interfaces/provider.interface.js';
import { PROVIDER_CATALOG } from '../metadata/provider-catalog.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { getSystemInstructionForMode } from '../../utils/response-mode.js';
import { parseSSEStream } from '../../utils/sse-stream.js';

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly id = 'openai';
  readonly displayName = 'OpenAI';
  readonly description = 'Industry-standard multimodal and reasoning models';
  readonly baseUrl = 'https://api.openai.com/v1';
  readonly defaultModel = 'openai:gpt-4o-mini';
  protected readonly apiKeyEnvVar = 'OPENAI_API_KEY';

  protected getApiKey(): string | undefined {
    return env.OPENAI_API_KEY;
  }

  listModels(): AIModelMetadata[] {
    const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === this.id)!;
    const isConfigured = Boolean(this.getApiKey());
    return catalogEntry.models.map((m) => ({
      ...m,
      providerId: this.id,
      isConfigured,
      status: isConfigured ? 'AVAILABLE' : 'UNAVAILABLE',
    }));
  }

  async executeRequest(request: AIExecuteRequest): Promise<AIExecuteResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AppError('OpenAI API key is not configured on the backend', 'INVALID_PROVIDER_CREDENTIALS', 401);
    }

    // Build message content with text and optional images
    let content: any = request.prompt;
    if (request.images && request.images.length > 0) {
      content = [
        { type: 'text', text: request.prompt },
        ...request.images.map((img) => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${img.dataBase64}`,
          },
        })),
      ];
    }

    const messages: any[] = [];
    const systemInstruction = request.systemInstruction || getSystemInstructionForMode(request.responseMode);
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content });

    const payload = {
      model: request.modelIdentifier,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      undefined,
      request.abortSignal
    );

    if (!res.ok) {
      const errorBody: any = await res.json().catch(() => ({}));
      const message = errorBody?.error?.message || `OpenAI returned HTTP ${res.status}`;
      const err = new Error(message) as any;
      err.status = res.status;
      err.headers = Object.fromEntries(res.headers.entries());
      const normalized = this.normalizeError(err);
      throw new AppError(normalized.message, normalized.category, res.status, normalized.retryAfterSeconds);
    }

    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return {
      text,
      model: request.modelIdentifier,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens,
      },
    };
  }

  async executeStreamingRequest(
    request: AIExecuteRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIExecuteResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AppError('OpenAI API key is not configured on the backend', 'INVALID_PROVIDER_CREDENTIALS', 401);
    }

    let content: any = request.prompt;
    if (request.images && request.images.length > 0) {
      content = [
        { type: 'text', text: request.prompt },
        ...request.images.map((img) => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${img.dataBase64}`,
          },
        })),
      ];
    }

    const messages: any[] = [];
    const systemInstruction = request.systemInstruction || getSystemInstructionForMode(request.responseMode);
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content });

    const payload = {
      model: request.modelIdentifier,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: true,
      stream_options: { include_usage: true },
    };

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      undefined,
      request.abortSignal
    );

    if (!res.ok) {
      const errorBody: any = await res.json().catch(() => ({}));
      const message = errorBody?.error?.message || `OpenAI returned HTTP ${res.status}`;
      const err = new Error(message) as any;
      err.status = res.status;
      err.headers = Object.fromEntries(res.headers.entries());
      const normalized = this.normalizeError(err);
      throw new AppError(normalized.message, normalized.category, res.status, normalized.retryAfterSeconds);
    }

    if (!res.body) {
      throw new AppError('No response body received from OpenAI stream', 'PROVIDER_SERVER_ERROR', 500);
    }

    let accumulatedText = '';
    let usage: any;

    await parseSSEStream(res.body, (_event, data) => {
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          accumulatedText += delta;
          onChunk(delta);
        }
        if (parsed?.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          };
        }
      } catch {
        // ignore incomplete parse chunk
      }
    });

    return {
      text: accumulatedText,
      model: request.modelIdentifier,
      usage,
    };
  }
}
