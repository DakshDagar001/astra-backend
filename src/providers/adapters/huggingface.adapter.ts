import { OpenAICompatibleAdapter } from './openai-compatible.base.js';
import { env } from '../../config/env.js';

export class HuggingFaceAdapter extends OpenAICompatibleAdapter {
  readonly id = 'huggingface';
  readonly displayName = 'Hugging Face';
  readonly description = 'Open-access Serverless Inference API and router endpoints';
  readonly baseUrl = 'https://router.huggingface.co/v1';
  readonly defaultModel = 'huggingface:qwen2.5-72b-instruct';
  protected readonly apiKeyEnvVar = 'HUGGINGFACE_API_KEY';

  protected getApiKey(): string | undefined {
    return env.HUGGINGFACE_API_KEY;
  }
}
