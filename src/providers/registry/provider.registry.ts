import { IProviderAdapter, AIProviderMetadata, AIModelMetadata } from '../interfaces/provider.interface.js';
import { OpenAIAdapter } from '../adapters/openai.adapter.js';
import { GeminiAdapter } from '../adapters/gemini.adapter.js';
import { OpenRouterAdapter } from '../adapters/openrouter.adapter.js';
import { GroqAdapter } from '../adapters/groq.adapter.js';
import { HuggingFaceAdapter } from '../adapters/huggingface.adapter.js';
import { NvidiaNimAdapter } from '../adapters/nvidianim.adapter.js';
import { TogetherAdapter } from '../adapters/together.adapter.js';
import { DeepInfraAdapter } from '../adapters/deepinfra.adapter.js';
import { Logger } from '../../logging/logger.js';

const logger = new Logger('ProviderRegistry');

export class ProviderRegistry {
  private adapters = new Map<string, IProviderAdapter>();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    const list: IProviderAdapter[] = [
      new OpenAIAdapter(),
      new GeminiAdapter(),
      new OpenRouterAdapter(),
      new GroqAdapter(),
      new HuggingFaceAdapter(),
      new NvidiaNimAdapter(),
      new TogetherAdapter(),
      new DeepInfraAdapter(),
    ];

    for (const adapter of list) {
      this.adapters.set(adapter.id, adapter);
      const meta = adapter.getProviderMetadata();
      logger.debug(`Registered provider: ${adapter.id} (configured: ${meta.isConfigured})`);
    }
  }

  registerProvider(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getProvider(providerId: string): IProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  listProviders(): AIProviderMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.getProviderMetadata());
  }

  listAllModels(): AIModelMetadata[] {
    const all: AIModelMetadata[] = [];
    for (const adapter of this.adapters.values()) {
      all.push(...adapter.listModels());
    }
    return all;
  }

  findModel(modelId: string): { provider: IProviderAdapter; model: AIModelMetadata } | null {
    for (const adapter of this.adapters.values()) {
      const models = adapter.listModels();
      const found = models.find((m) => m.id === modelId || m.modelIdentifier === modelId);
      if (found) {
        return { provider: adapter, model: found };
      }
    }
    return null;
  }
}

export const providerRegistry = new ProviderRegistry();
