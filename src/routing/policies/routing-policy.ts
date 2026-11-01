import { AIModelMetadata, IProviderAdapter } from '../../providers/interfaces/provider.interface.js';
import { providerRegistry } from '../../providers/registry/provider.registry.js';
import { RoutingConfigurationRecord } from '../../database/repositories/routing.repository.js';
import { cooldownManager } from '../cooldown/cooldown-manager.js';
import { Logger } from '../../logging/logger.js';

const logger = new Logger('RoutingPolicy');

export interface CandidateModel {
  adapter: IProviderAdapter;
  model: AIModelMetadata;
}

export class RoutingPolicy {
  async resolveCandidates(
    requiresVision: boolean,
    config: RoutingConfigurationRecord,
    requestedModelId?: string
  ): Promise<CandidateModel[]> {
    const allModels = providerRegistry.listAllModels();
    const candidateIds: string[] = [];

    // 1. Manual pinning check
    const pinnedId = requestedModelId || (config.mode === 'manual' ? config.pinnedModelId : null);

    if (pinnedId) {
      candidateIds.push(pinnedId);
      if (config.fallbackEnabled) {
        // Append priority models as fallbacks
        const fallbackList = requiresVision ? config.visionPriorityModels : config.textPriorityModels;
        for (const id of fallbackList) {
          if (!candidateIds.includes(id)) {
            candidateIds.push(id);
          }
        }
      }
    } else {
      // Automatic routing: use user priority list for modality
      const priorityList = requiresVision ? config.visionPriorityModels : config.textPriorityModels;
      candidateIds.push(...priorityList);
      
      // Also append any remaining models from the registry in case priorities are exhausted
      for (const model of allModels) {
        if (!candidateIds.includes(model.id)) {
          candidateIds.push(model.id);
        }
      }
    }

    // 2. Validate and filter candidates
    const eligibleCandidates: CandidateModel[] = [];

    for (const modelId of candidateIds) {
      const match = providerRegistry.findModel(modelId);
      if (!match) {
        logger.debug(`Skipping unknown model ID: ${modelId}`);
        continue;
      }

      const { provider, model } = match;

      // Skip unconfigured providers
      const configStatus = provider.validateConfiguration();
      if (!configStatus.isConfigured) {
        logger.debug(`Skipping model ${model.id}: Provider ${provider.id} is unconfigured`);
        continue;
      }

      // Check vision capability
      if (requiresVision && !model.supportsVision) {
        logger.debug(`Skipping model ${model.id}: Lacks vision capability for image request`);
        continue;
      }

      // Check cooldown
      const inCooldown = await cooldownManager.isInCooldown(provider.id, model.id);
      if (inCooldown) {
        logger.debug(`Skipping model ${model.id}: Currently in cooldown`);
        continue;
      }

      eligibleCandidates.push({
        adapter: provider,
        model,
      });
    }

    return eligibleCandidates;
  }
}

export const routingPolicy = new RoutingPolicy();
