import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class GroqAdapter extends OpenAICompatibleAdapter {
  readonly id = 'groq';
  readonly displayName = 'Groq';
  readonly description = 'Ultra-low latency LPU inference engine';
  readonly baseUrl = 'https://api.groq.com/openai/v1';
  readonly defaultModel = 'groq:llama-3.3-70b';
  protected readonly apiKeyEnvVar = 'GROQ_API_KEY';

  protected getApiKey(): string | undefined {
    return env.GROQ_API_KEY;
  }
}
