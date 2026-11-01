import { ErrorCategory } from '../../utils/errors.js';
import { ValidatedImage } from '../../utils/image.js';

export interface AIProviderMetadata {
  id: string;
  displayName: string;
  description: string;
  isConfigured: boolean;
  supportedModalities: ('text' | 'vision')[];
  defaultModel: string;
  baseUrl: string;
}

export interface AIModelMetadata {
  id: string; // e.g. "openai:gpt-4o-mini"
  providerId: string;
  displayName: string;
  modelIdentifier: string;
  supportsText: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  contextWindow?: number;
  inputModality: ('text' | 'image')[];
  outputModality: ('text')[];
  isConfigured: boolean;
  status: 'AVAILABLE' | 'COOLDOWN' | 'DEGRADED' | 'UNAVAILABLE';
}

export interface AIExecuteRequest {
  requestId: string;
  prompt: string;
  responseMode?: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
  systemInstruction?: string;
  images?: ValidatedImage[];
  modelIdentifier: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface AIUsageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIExecuteResponse {
  text: string;
  model: string;
  usage?: AIUsageMetadata;
}

export interface IProviderAdapter {
  readonly id: string;
  getProviderMetadata(): AIProviderMetadata;
  listModels(): AIModelMetadata[];
  validateConfiguration(): { isConfigured: boolean; reason?: string };
  supportsCapability(modelIdentifier: string, capability: 'text' | 'vision' | 'streaming'): boolean;
  executeRequest(request: AIExecuteRequest): Promise<AIExecuteResponse>;
  executeStreamingRequest?(
    request: AIExecuteRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIExecuteResponse>;
  normalizeError(error: any): { category: ErrorCategory; message: string; retryAfterSeconds?: number };
}
