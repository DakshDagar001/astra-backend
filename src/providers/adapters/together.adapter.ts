import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class TogetherAdapter extends OpenAICompatibleAdapter {
  readonly id = 'together';
  readonly displayName = 'Together AI';
  readonly description = 'Fast open-source model inference platform';
  readonly baseUrl = 'https://api.together.xyz/v1';
  readonly defaultModel = 'together:llama-3.3-70b-instruct';
  protected readonly apiKeyEnvVar = 'TOGETHER_API_KEY';

  protected getApiKey(): string | undefined {
    return env.TOGETHER_API_KEY;
  }
}
