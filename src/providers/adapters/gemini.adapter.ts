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

export class GeminiAdapter extends BaseProviderAdapter {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly description = 'High-speed multimodal intelligence with large context windows';
  readonly baseUrl = 'https://generativelanguage.googleapis.com';
  readonly defaultModel = 'gemini:gemini-2.5-flash';
  protected readonly apiKeyEnvVar = 'GEMINI_API_KEY';

  protected getApiKey(): string | undefined {
    return env.GEMINI_API_KEY;
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
      throw new AppError('Gemini API key is not configured on the backend', 'INVALID_PROVIDER_CREDENTIALS', 401);
    }

    // Prepare parts: text and optional inlineData images
    const parts: any[] = [{ text: request.prompt }];
    if (request.images && request.images.length > 0) {
      for (const img of request.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.dataBase64,
          },
        });
      }
    }

    const systemInstruction = request.systemInstruction || getSystemInstructionForMode(request.responseMode);

    const payload: any = {
      contents: [{ parts }],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 2048,
      },
    };
    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const url = `${this.baseUrl}/v1beta/models/${request.modelIdentifier}:generateContent?key=${apiKey}`;

    const res = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      undefined,
      request.abortSignal
    );

    if (!res.ok) {
      const errorBody: any = await res.json().catch(() => ({}));
      const message = errorBody?.error?.message || `Gemini returned HTTP ${res.status}`;
      const err = new Error(message) as any;
      err.status = res.status;
      err.headers = Object.fromEntries(res.headers.entries());
      const normalized = this.normalizeError(err);
      throw new AppError(normalized.message, normalized.category, res.status, normalized.retryAfterSeconds);
    }

    const data: any = await res.json();
    const candidate = data?.candidates?.[0];
    const textPart = candidate?.content?.parts?.find((p: any) => p.text)?.text || '';

    return {
      text: textPart,
      model: request.modelIdentifier,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount,
        completionTokens: data?.usageMetadata?.candidatesTokenCount,
        totalTokens: data?.usageMetadata?.totalTokenCount,
      },
    };
  }

  async executeStreamingRequest(
    request: AIExecuteRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIExecuteResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AppError('Gemini API key is not configured on the backend', 'INVALID_PROVIDER_CREDENTIALS', 401);
    }

    const parts: any[] = [{ text: request.prompt }];
    if (request.images && request.images.length > 0) {
      for (const img of request.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.dataBase64,
          },
        });
      }
    }

    const systemInstruction = request.systemInstruction || getSystemInstructionForMode(request.responseMode);

    const payload: any = {
      contents: [{ parts }],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 2048,
      },
    };
    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const url = `${this.baseUrl}/v1beta/models/${request.modelIdentifier}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const res = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      undefined,
      request.abortSignal
    );

    if (!res.ok) {
      const errorBody: any = await res.json().catch(() => ({}));
      const message = errorBody?.error?.message || `Gemini returned HTTP ${res.status}`;
      const err = new Error(message) as any;
      err.status = res.status;
      err.headers = Object.fromEntries(res.headers.entries());
      const normalized = this.normalizeError(err);
      throw new AppError(normalized.message, normalized.category, res.status, normalized.retryAfterSeconds);
    }

    if (!res.body) {
      throw new AppError('No response body received from Gemini stream', 'PROVIDER_SERVER_ERROR', 500);
    }

    let accumulatedText = '';
    let usage: any;

    await parseSSEStream(res.body, (_event, data) => {
      try {
        const parsed = JSON.parse(data);
        const candidate = parsed?.candidates?.[0];
        const textPart = candidate?.content?.parts?.find((p: any) => p.text)?.text;
        if (textPart) {
          accumulatedText += textPart;
          onChunk(textPart);
        }
        if (parsed?.usageMetadata) {
          usage = {
            promptTokens: parsed.usageMetadata.promptTokenCount,
            completionTokens: parsed.usageMetadata.candidatesTokenCount,
            totalTokens: parsed.usageMetadata.totalTokenCount,
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
