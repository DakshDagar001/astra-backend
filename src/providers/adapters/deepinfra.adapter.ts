import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class DeepInfraAdapter extends OpenAICompatibleAdapter {
  readonly id = 'deepinfra';
  readonly displayName = 'DeepInfra';
  readonly description = 'Cost-effective serverless machine learning inference';
  readonly baseUrl = 'https://api.deepinfra.com/v1/openai';
  readonly defaultModel = 'deepinfra:llama-3.3-70b-instruct';
  protected readonly apiKeyEnvVar = 'DEEPINFRA_API_KEY';

  protected getApiKey(): string | undefined {
    return env.DEEPINFRA_API_KEY;
  }
}
