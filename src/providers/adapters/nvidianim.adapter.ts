import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class NvidiaNimAdapter extends OpenAICompatibleAdapter {
  readonly id = 'nvidia';
  readonly displayName = 'NVIDIA NIM';
  readonly description = 'Enterprise accelerated microservices on NVIDIA DGX Cloud';
  readonly baseUrl = 'https://integrate.api.nvidia.com/v1';
  readonly defaultModel = 'nvidia:meta-llama-3.1-70b-instruct';
  protected readonly apiKeyEnvVar = 'NVIDIA_NIM_API_KEY';

  protected getApiKey(): string | undefined {
    return env.NVIDIA_NIM_API_KEY;
  }
}
