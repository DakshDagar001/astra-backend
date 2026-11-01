import { routingRepository } from '../../database/repositories/routing.repository.js';
import { routingPolicy } from '../policies/routing-policy.js';
import { fallbackExecutor, ExecutionResult } from '../fallback/fallback-executor.js';
import { AIExecuteRequest } from '../../providers/interfaces/provider.interface.js';
import { validateImagePayload } from '../../utils/image.js';
import { AppError } from '../../utils/errors.js';
import { Logger } from '../../logging/logger.js';

const logger = new Logger('AIRE');

export interface AIRERequestContext {
  correlationId: string;
  sessionId?: string;
  clientType?: string;
  modelOverride?: string;
}

export class AireEngine {
  async processRequest(
    request: AIExecuteRequest,
    context: AIRERequestContext
  ): Promise<ExecutionResult> {
    if (!request.prompt || typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
      throw new AppError('Prompt is required and must not be empty', 'INVALID_REQUEST', 400);
    }

    // Validate images if provided
    const validatedImages = [];
    if (request.images && request.images.length > 0) {
      for (const img of request.images) {
        validatedImages.push(validateImagePayload(img));
      }
    }

    const requiresVision = validatedImages.length > 0;
    const config = await routingRepository.getConfig();

    logger.info(`[${context.correlationId}] AIRE starting route resolution`, {
      requiresVision,
      mode: config.mode,
      requestedModel: context.modelOverride || request.modelIdentifier,
    });

    // Resolve candidates
    const candidates = await routingPolicy.resolveCandidates(
      requiresVision,
      config,
      context.modelOverride || (config.mode === 'manual' ? config.pinnedModelId || undefined : undefined)
    );

    if (candidates.length === 0) {
      if (requiresVision) {
        throw new AppError(
          'No available and configured vision models found to process image payload',
          'UNSUPPORTED_CAPABILITY',
          400
        );
      }
      throw new AppError(
        'No available AI models found matching your configuration',
        'PROVIDER_UNAVAILABLE',
        503
      );
    }

    return fallbackExecutor.execute(
      {
        ...request,
        images: validatedImages,
      },
      candidates,
      config.maxAttempts,
      context.correlationId,
      context.sessionId,
      context.clientType,
      config.cooldownSettings
    );
  }

  async processStreamingRequest(
    request: AIExecuteRequest,
    context: AIRERequestContext,
    callbacks: {
      onStart: (meta: { provider: string; model: string }) => void;
      onChunk: (chunk: string) => void;
      onComplete?: (result: ExecutionResult) => void;
    }
  ): Promise<ExecutionResult> {
    if (!request.prompt || typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
      throw new AppError('Prompt is required and must not be empty', 'INVALID_REQUEST', 400);
    }

    const validatedImages = [];
    if (request.images && request.images.length > 0) {
      for (const img of request.images) {
        validatedImages.push(validateImagePayload(img));
      }
    }

    const requiresVision = validatedImages.length > 0;
    const config = await routingRepository.getConfig();

    logger.info(`[${context.correlationId}] AIRE starting streaming route resolution`, {
      requiresVision,
      mode: config.mode,
      requestedModel: context.modelOverride || request.modelIdentifier,
    });

    const candidates = await routingPolicy.resolveCandidates(
      requiresVision,
      config,
      context.modelOverride || (config.mode === 'manual' ? config.pinnedModelId || undefined : undefined)
    );

    if (candidates.length === 0) {
      if (requiresVision) {
        throw new AppError(
          'No available and configured vision models found to process image payload',
          'UNSUPPORTED_CAPABILITY',
          400
        );
      }
      throw new AppError(
        'No available AI models found matching your configuration',
        'PROVIDER_UNAVAILABLE',
        503
      );
    }

    return fallbackExecutor.executeStreaming(
      {
        ...request,
        images: validatedImages,
      },
      candidates,
      config.maxAttempts,
      context.correlationId,
      callbacks,
      context.sessionId,
      context.clientType,
      config.cooldownSettings
    );
  }
}

export const aireEngine = new AireEngine();
