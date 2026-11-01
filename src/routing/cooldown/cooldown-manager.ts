import { healthRepository } from '../../database/repositories/health.repository.js';
import { ErrorCategory } from '../../utils/errors.js';
import { Logger } from '../../logging/logger.js';

const logger = new Logger('CooldownManager');

export interface CooldownConfig {
  rateLimitSeconds?: number;
  quotaExhaustedSeconds?: number;
  serverErrorSeconds?: number;
  timeoutSeconds?: number;
}

export class CooldownManager {
  private defaultCooldowns: Required<CooldownConfig> = {
    rateLimitSeconds: 60,
    quotaExhaustedSeconds: 3600,
    serverErrorSeconds: 30,
    timeoutSeconds: 15,
  };

  async isInCooldown(providerId: string, modelId?: string): Promise<boolean> {
    const now = new Date();
    
    // Check provider-level cooldown
    const providerHealth = await healthRepository.getRecord(providerId);
    if (providerHealth?.cooldownUntil && providerHealth.cooldownUntil > now) {
      return true;
    }

    // Check model-level cooldown
    if (modelId) {
      const modelHealth = await healthRepository.getRecord(modelId);
      if (modelHealth?.cooldownUntil && modelHealth.cooldownUntil > now) {
        return true;
      }
    }

    return false;
  }

  async markCooldown(
    providerId: string,
    modelId: string | undefined,
    category: ErrorCategory,
    errorMessage: string,
    retryAfterSeconds?: number,
    customSettings?: CooldownConfig
  ): Promise<void> {
    const now = Date.now();
    let cooldownDurationSec = retryAfterSeconds;

    if (!cooldownDurationSec) {
      switch (category) {
        case 'QUOTA_EXHAUSTED':
        case 'BILLING_LIMIT_REACHED':
          cooldownDurationSec = customSettings?.quotaExhaustedSeconds || this.defaultCooldowns.quotaExhaustedSeconds;
          break;
        case 'RATE_LIMITED':
          cooldownDurationSec = customSettings?.rateLimitSeconds || this.defaultCooldowns.rateLimitSeconds;
          break;
        case 'PROVIDER_SERVER_ERROR':
        case 'PROVIDER_UNAVAILABLE':
          cooldownDurationSec = customSettings?.serverErrorSeconds || this.defaultCooldowns.serverErrorSeconds;
          break;
        case 'TIMEOUT':
        case 'NETWORK_ERROR':
          cooldownDurationSec = customSettings?.timeoutSeconds || this.defaultCooldowns.timeoutSeconds;
          break;
        default:
          cooldownDurationSec = 30;
          break;
      }
    }

    const cooldownUntil = new Date(now + cooldownDurationSec * 1000);
    const targetId = category === 'QUOTA_EXHAUSTED' || category === 'BILLING_LIMIT_REACHED'
      ? providerId
      : (modelId || providerId);

    const existing = await healthRepository.getRecord(targetId);
    const failureCount = (existing?.failureCount || 0) + 1;

    logger.warn(`Entering cooldown for ${targetId} for ${cooldownDurationSec}s (${category}): ${errorMessage}`);

    await healthRepository.setRecord({
      id: targetId,
      providerId,
      modelId: modelId || null,
      status: 'COOLDOWN',
      cooldownUntil,
      errorCategory: category,
      lastErrorMessage: errorMessage,
      failureCount,
      updatedAt: new Date(),
    });
  }

  async clearCooldown(targetId: string): Promise<void> {
    const existing = await healthRepository.getRecord(targetId);
    if (existing) {
      await healthRepository.setRecord({
        ...existing,
        status: 'AVAILABLE',
        cooldownUntil: null,
        failureCount: 0,
        updatedAt: new Date(),
      });
    }
  }
}

export const cooldownManager = new CooldownManager();
