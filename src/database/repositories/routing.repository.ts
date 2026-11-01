import { getDbPool } from '../connection.js';
import { env } from '../../config/env.js';
import { Logger } from '../../logging/logger.js';

export interface RoutingConfigurationRecord {
  id: string;
  mode: 'automatic' | 'manual';
  pinnedModelId?: string | null;
  fallbackEnabled: boolean;
  maxAttempts: number;
  textPriorityModels: string[];
  visionPriorityModels: string[];
  cooldownSettings: {
    rateLimitSeconds?: number;
    quotaExhaustedSeconds?: number;
    serverErrorSeconds?: number;
    timeoutSeconds?: number;
  };
  updatedAt: Date;
}

const DEFAULT_CONFIG: RoutingConfigurationRecord = {
  id: 'default',
  mode: 'automatic',
  pinnedModelId: null,
  fallbackEnabled: true,
  maxAttempts: 3,
  textPriorityModels: [
    'openai:gpt-4o-mini',
    'gemini:gemini-2.5-flash',
    'groq:llama-3.3-70b',
    'openrouter:auto',
    'together:llama-3.3-70b-instruct',
    'deepinfra:llama-3.3-70b-instruct',
    'nvidia:meta-llama-3.1-70b-instruct',
    'huggingface:qwen2.5-72b-instruct',
  ],
  visionPriorityModels: [
    'gemini:gemini-2.5-flash',
    'openai:gpt-4o-mini',
    'openrouter:auto',
    'groq:llama-3.2-11b-vision',
    'together:llama-3.2-11b-vision-instruct',
    'deepinfra:llama-3.2-11b-vision-instruct',
    'nvidia:meta-llama-3.2-11b-vision-instruct',
  ],
  cooldownSettings: {
    rateLimitSeconds: 60,
    quotaExhaustedSeconds: 3600,
    serverErrorSeconds: 30,
    timeoutSeconds: 15,
  },
  updatedAt: new Date(),
};

let memoryConfig: RoutingConfigurationRecord = { ...DEFAULT_CONFIG };

export class RoutingRepository {
  private useMemory(): boolean {
    return !env.DATABASE_URL;
  }

  async getConfig(): Promise<RoutingConfigurationRecord> {
    if (this.useMemory()) {
      return { ...memoryConfig };
    }

    const pool = getDbPool();
    try {
      const res = await pool.query(
        `SELECT id, mode, pinned_model_id as "pinnedModelId",
                fallback_enabled as "fallbackEnabled", max_attempts as "maxAttempts",
                text_priority_models as "textPriorityModels",
                vision_priority_models as "visionPriorityModels",
                cooldown_settings as "cooldownSettings",
                updated_at as "updatedAt"
         FROM routing_configurations WHERE id = 'default' LIMIT 1`
      );
      if (res.rows.length === 0) return { ...DEFAULT_CONFIG };
      return res.rows[0];
    } catch {
      return { ...memoryConfig };
    }
  }

  async updateConfig(partial: Partial<Omit<RoutingConfigurationRecord, 'id' | 'updatedAt'>>): Promise<RoutingConfigurationRecord> {
    const current = await this.getConfig();
    const updated: RoutingConfigurationRecord = {
      ...current,
      ...partial,
      updatedAt: new Date(),
    };

    memoryConfig = { ...updated };

    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO routing_configurations (
            id, mode, pinned_model_id, fallback_enabled, max_attempts,
            text_priority_models, vision_priority_models, cooldown_settings, updated_at
          ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            mode = EXCLUDED.mode,
            pinned_model_id = EXCLUDED.pinned_model_id,
            fallback_enabled = EXCLUDED.fallback_enabled,
            max_attempts = EXCLUDED.max_attempts,
            text_priority_models = EXCLUDED.text_priority_models,
            vision_priority_models = EXCLUDED.vision_priority_models,
            cooldown_settings = EXCLUDED.cooldown_settings,
            updated_at = EXCLUDED.updated_at`,
          [
            updated.mode,
            updated.pinnedModelId || null,
            updated.fallbackEnabled,
            updated.maxAttempts,
            JSON.stringify(updated.textPriorityModels),
            JSON.stringify(updated.visionPriorityModels),
            JSON.stringify(updated.cooldownSettings),
            updated.updatedAt,
          ]
        );
      } catch {}
    }

    return updated;
  }
}

export const routingRepository = new RoutingRepository();
