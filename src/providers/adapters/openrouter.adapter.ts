import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  readonly id = 'openrouter';
  readonly displayName = 'OpenRouter';
  readonly description = 'Unified AI routing across hundreds of open and proprietary models';
  readonly baseUrl = 'https://openrouter.ai/api/v1';
  readonly defaultModel = 'openrouter:auto';
  protected readonly apiKeyEnvVar = 'OPENROUTER_API_KEY';

  protected getApiKey(): string | undefined {
    return env.OPENROUTER_API_KEY;
  }

  protected override getCustomHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://astra-ai.render.com',
      'X-Title': 'Astra AI Assistant',
    };
  }
}
