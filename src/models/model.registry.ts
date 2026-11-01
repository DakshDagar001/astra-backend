import { AIModelMetadata } from '../providers/interfaces/provider.interface.js';
import { providerRegistry } from '../providers/registry/provider.registry.js';
import { healthRepository } from '../database/repositories/health.repository.js';

export class ModelRegistry {
  async listModels(): Promise<AIModelMetadata[]> {
    const models = providerRegistry.listAllModels();
    const now = new Date();

    const healthRecords = await healthRepository.getAllRecords();
    const healthMap = new Map(healthRecords.map((r) => [r.id, r]));

    return models.map((m) => {
      // Check if provider or model is in cooldown
      const modelRecord = healthMap.get(m.id);
      const providerRecord = healthMap.get(m.providerId);

      let status = m.status;
      if (
        (modelRecord?.cooldownUntil && modelRecord.cooldownUntil > now) ||
        (providerRecord?.cooldownUntil && providerRecord.cooldownUntil > now)
      ) {
        status = 'COOLDOWN';
      }

      return {
        ...m,
        status,
      };
    });
  }

  async getModel(modelId: string): Promise<AIModelMetadata | null> {
    const models = await this.listModels();
    return models.find((m) => m.id === modelId || m.modelIdentifier === modelId) || null;
  }
}

export const modelRegistry = new ModelRegistry();
