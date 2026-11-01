import {
  IProviderAdapter,
  AIProviderMetadata,
  AIModelMetadata,
  AIExecuteRequest,
  AIExecuteResponse,
} from '../interfaces/provider.interface.js';
import { ErrorCategory, AppError } from '../../utils/errors.js';
import { Logger } from '../../logging/logger.js';
import { SYSTEM_CONSTANTS } from '../../config/constants.js';

export abstract class BaseProviderAdapter implements IProviderAdapter {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly description: string;
  abstract readonly baseUrl: string;
  abstract readonly defaultModel: string;
  protected abstract readonly apiKeyEnvVar: string;
  protected abstract getApiKey(): string | undefined;

  protected logger: Logger;

  constructor() {
    this.logger = new Logger(`Provider:${this.constructor.name}`);
  }

  getProviderMetadata(): AIProviderMetadata {
    const isConfigured = Boolean(this.getApiKey() && this.getApiKey()!.trim().length > 0);
    const models = this.listModels();
    const hasVision = models.some((m) => m.supportsVision);
    const supportedModalities: ('text' | 'vision')[] = ['text'];
    if (hasVision) supportedModalities.push('vision');

    return {
      id: this.id,
      displayName: this.displayName,
      description: this.description,
      isConfigured,
      supportedModalities,
      defaultModel: this.defaultModel,
      baseUrl: this.baseUrl,
    };
  }

  validateConfiguration(): { isConfigured: boolean; reason?: string } {
    const key = this.getApiKey();
    if (!key || key.trim().length === 0) {
      return {
        isConfigured: false,
        reason: `API key environment variable ${this.apiKeyEnvVar} is missing or empty`,
      };
    }
    return { isConfigured: true };
  }

  abstract listModels(): AIModelMetadata[];

  supportsCapability(modelIdentifier: string, capability: 'text' | 'vision' | 'streaming'): boolean {
    const models = this.listModels();
    const found = models.find((m) => m.modelIdentifier === modelIdentifier || m.id === modelIdentifier);
    if (!found) return false;
    if (capability === 'text') return found.supportsText;
    if (capability === 'vision') return found.supportsVision;
    if (capability === 'streaming') return found.supportsStreaming;
    return false;
  }

  abstract executeRequest(request: AIExecuteRequest): Promise<AIExecuteResponse>;

  normalizeError(error: any): { category: ErrorCategory; message: string; retryAfterSeconds?: number } {
    if (error instanceof AppError) {
      return {
        category: error.category,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    const message = (error?.message || String(error)).toLowerCase();
    const status = error?.status || error?.statusCode || error?.response?.status;
    const retryAfter = error?.retryAfterSeconds || error?.headers?.['retry-after'];

    let retrySeconds: number | undefined;
    if (retryAfter) {
      const parsed = parseInt(String(retryAfter), 10);
      if (!isNaN(parsed)) retrySeconds = parsed;
    }

    // 1. Quota & billing limits
    if (
      message.includes('insufficient_quota') ||
      message.includes('exceeded your current quota') ||
      message.includes('quota exceeded') ||
      message.includes('credit limit') ||
      message.includes('billing')
    ) {
      return {
        category: 'QUOTA_EXHAUSTED',
        message: 'Provider quota or balance exhausted',
        retryAfterSeconds: retrySeconds || 3600,
      };
    }

    // 2. Rate limits
    if (status === 429 || message.includes('rate limit') || message.includes('too many requests') || message.includes('tpm') || message.includes('rpm')) {
      return {
        category: 'RATE_LIMITED',
        message: 'Provider rate limit reached',
        retryAfterSeconds: retrySeconds || 60,
      };
    }

    // 3. Authentication & credentials
    if (status === 401 || message.includes('unauthorized') || message.includes('invalid api key') || message.includes('incorrect api key')) {
      return {
        category: 'INVALID_PROVIDER_CREDENTIALS',
        message: 'Invalid or expired provider API credentials',
      };
    }

    // 4. Content policy / refusals
    if (message.includes('safety') || message.includes('content policy') || message.includes('flagged') || message.includes('refusal') || message.includes('moderation')) {
      return {
        category: 'CONTENT_POLICY_REFUSAL',
        message: 'Request declined by provider content safety policy',
      };
    }

    // 5. Model unavailable
    if (status === 404 || message.includes('model not found') || message.includes('model does not exist') || message.includes('decommissioned')) {
      return {
        category: 'MODEL_UNAVAILABLE',
        message: 'The requested model is not available or does not exist on this provider',
      };
    }

    // 6. Timeouts
    if (message.includes('timeout') || message.includes('timed out') || error?.code === 'ETIMEDOUT') {
      return {
        category: 'TIMEOUT',
        message: 'Request to provider timed out',
        retryAfterSeconds: 5,
      };
    }

    // 7. Network / connection errors
    if (message.includes('fetch failed') || message.includes('econnrefused') || message.includes('network') || error?.code === 'ENOTFOUND') {
      return {
        category: 'NETWORK_ERROR',
        message: 'Network connection failure while communicating with provider',
        retryAfterSeconds: 5,
      };
    }

    // 8. Provider server error
    if (status >= 500 && status < 600) {
      return {
        category: 'PROVIDER_SERVER_ERROR',
        message: `Provider server returned HTTP ${status}`,
        retryAfterSeconds: 15,
      };
    }

    // 9. Bad request / invalid input
    if (status === 400 || message.includes('invalid_request') || message.includes('bad request')) {
      return {
        category: 'INVALID_REQUEST',
        message: error?.message || 'Invalid request payload sent to provider',
      };
    }

    return {
      category: 'UNKNOWN_ERROR',
      message: error?.message || 'Unknown provider error occurred',
    };
  }

  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = SYSTEM_CONSTANTS.DEFAULT_REQUEST_TIMEOUT_MS,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new AppError('Client aborted request', 'UNKNOWN_ERROR', 499);
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err: any) {
      if (externalSignal?.aborted) {
        throw new AppError('Client aborted request', 'UNKNOWN_ERROR', 499);
      }
      if (err.name === 'AbortError') {
        throw new AppError(`Provider request timed out after ${timeoutMs}ms`, 'TIMEOUT', 504);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}
