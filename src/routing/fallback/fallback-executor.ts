import { CandidateModel } from '../policies/routing-policy.js';
import { AIExecuteRequest, AIExecuteResponse } from '../../providers/interfaces/provider.interface.js';
import { ErrorClassifier } from '../policies/error-classifier.js';
import { cooldownManager, CooldownConfig } from '../cooldown/cooldown-manager.js';
import { auditRepository } from '../../database/repositories/audit.repository.js';
import { AppError, ErrorCategory } from '../../utils/errors.js';
import { Logger } from '../../logging/logger.js';

const logger = new Logger('FallbackExecutor');

export interface ExecutionResult {
  response: AIExecuteResponse;
  actualProvider: string;
  actualModel: string;
  requestedModel: string;
  fallbackOccurred: boolean;
  attemptsCount: number;
  latencyMs: number;
}

export class FallbackExecutor {
  async execute(
    request: AIExecuteRequest,
    candidates: CandidateModel[],
    maxAttempts: number,
    correlationId: string,
    sessionId?: string,
    clientType?: string,
    cooldownConfig?: CooldownConfig
  ): Promise<ExecutionResult> {
    if (candidates.length === 0) {
      throw new AppError(
        'No eligible and configured AI models available to serve this request',
        'PROVIDER_UNAVAILABLE',
        503
      );
    }

    const requestedModel = request.modelIdentifier;
    const modality = request.images && request.images.length > 0 ? 'vision' : 'text';
    const startTime = Date.now();
    let attemptsCount = 0;
    let fallbackOccurred = false;
    let lastError: AppError | null = null;

    const limit = Math.min(maxAttempts, candidates.length);

    for (let i = 0; i < limit; i++) {
      const candidate = candidates[i];
      attemptsCount++;
      const attemptStartTime = Date.now();

      logger.info(
        `[${correlationId}] Attempt ${attemptsCount}/${limit} using ${candidate.adapter.id}:${candidate.model.modelIdentifier}`
      );

      try {
        const response = await candidate.adapter.executeRequest({
          ...request,
          modelIdentifier: candidate.model.modelIdentifier,
        });

        const latencyMs = Date.now() - startTime;

        // Log successful audit
        await auditRepository.recordLog({
          correlationId,
          sessionId,
          clientType,
          requestedModel,
          actualProvider: candidate.adapter.id,
          actualModel: candidate.model.id,
          modality,
          fallbackOccurred,
          attemptsCount,
          latencyMs,
          statusCode: 200,
          createdAt: new Date(),
        });

        return {
          response,
          actualProvider: candidate.adapter.id,
          actualModel: candidate.model.id,
          requestedModel,
          fallbackOccurred,
          attemptsCount,
          latencyMs,
        };
      } catch (err: any) {
        const attemptLatencyMs = Date.now() - attemptStartTime;
        const normalized = candidate.adapter.normalizeError(err);
        const category: ErrorCategory = normalized.category;

        logger.warn(
          `[${correlationId}] Attempt ${attemptsCount} failed on ${candidate.adapter.id}:${candidate.model.modelIdentifier} (${category}): ${normalized.message}`
        );

        lastError = new AppError(
          normalized.message,
          category,
          err.statusCode || (category === 'RATE_LIMITED' || category === 'QUOTA_EXHAUSTED' ? 429 : 502),
          normalized.retryAfterSeconds
        );

        // Check if error is eligible for fallback
        if (ErrorClassifier.isFallbackEligible(category)) {
          // Enter cooldown
          await cooldownManager.markCooldown(
            candidate.adapter.id,
            candidate.model.id,
            category,
            normalized.message,
            normalized.retryAfterSeconds,
            cooldownConfig
          );

          fallbackOccurred = true;

          // If more candidates remain within max attempts, backoff and retry next candidate
          if (i + 1 < limit) {
            // Short exponential backoff with jitter
            const backoffMs = Math.min(1000 * Math.pow(1.5, i) + Math.random() * 200, 3000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
        } else {
          // Errors that MUST NOT trigger fallback (invalid input, content policy refusal, invalid key)
          await auditRepository.recordLog({
            correlationId,
            sessionId,
            clientType,
            requestedModel,
            actualProvider: candidate.adapter.id,
            actualModel: candidate.model.id,
            modality,
            fallbackOccurred,
            attemptsCount,
            latencyMs: Date.now() - startTime,
            statusCode: lastError.statusCode,
            errorCategory: category,
            createdAt: new Date(),
          });

          throw lastError;
        }
      }
    }

    const totalLatencyMs = Date.now() - startTime;

    // Log final failed audit
    await auditRepository.recordLog({
      correlationId,
      sessionId,
      clientType,
      requestedModel,
      modality,
      fallbackOccurred,
      attemptsCount,
      latencyMs: totalLatencyMs,
      statusCode: lastError?.statusCode || 503,
      errorCategory: lastError?.category || 'PROVIDER_UNAVAILABLE',
      createdAt: new Date(),
    });

    throw (
      lastError ||
      new AppError(
        `All ${attemptsCount} attempts across configured providers failed`,
        'PROVIDER_UNAVAILABLE',
        503
      )
    );
  }

  async executeStreaming(
    request: AIExecuteRequest,
    candidates: CandidateModel[],
    maxAttempts: number,
    correlationId: string,
    callbacks: {
      onStart: (meta: { provider: string; model: string }) => void;
      onChunk: (chunk: string) => void;
      onComplete?: (result: ExecutionResult) => void;
    },
    sessionId?: string,
    clientType?: string,
    cooldownConfig?: CooldownConfig
  ): Promise<ExecutionResult> {
    if (candidates.length === 0) {
      throw new AppError(
        'No eligible and configured AI models available to serve this request',
        'PROVIDER_UNAVAILABLE',
        503
      );
    }

    const requestedModel = request.modelIdentifier;
    const modality = request.images && request.images.length > 0 ? 'vision' : 'text';
    const startTime = Date.now();
    let attemptsCount = 0;
    let fallbackOccurred = false;
    let lastError: AppError | null = null;
    let firstChunkEmitted = false;

    const limit = Math.min(maxAttempts, candidates.length);

    for (let i = 0; i < limit; i++) {
      const candidate = candidates[i];
      attemptsCount++;
      const attemptStartTime = Date.now();

      logger.info(
        `[${correlationId}] Streaming attempt ${attemptsCount}/${limit} using ${candidate.adapter.id}:${candidate.model.modelIdentifier}`
      );

      try {
        let modelStarted = false;
        let response: AIExecuteResponse;

        if (candidate.adapter.executeStreamingRequest) {
          response = await candidate.adapter.executeStreamingRequest(
            {
              ...request,
              modelIdentifier: candidate.model.modelIdentifier,
            },
            (chunk: string) => {
              if (!modelStarted) {
                modelStarted = true;
                firstChunkEmitted = true;
                callbacks.onStart({
                  provider: candidate.adapter.id,
                  model: candidate.model.id,
                });
              }
              callbacks.onChunk(chunk);
            }
          );
        } else {
          // Adapter does not support streaming, fallback to single synchronous response chunk
          response = await candidate.adapter.executeRequest({
            ...request,
            modelIdentifier: candidate.model.modelIdentifier,
          });
          firstChunkEmitted = true;
          callbacks.onStart({
            provider: candidate.adapter.id,
            model: candidate.model.id,
          });
          callbacks.onChunk(response.text);
        }

        const latencyMs = Date.now() - startTime;

        await auditRepository.recordLog({
          correlationId,
          sessionId,
          clientType,
          requestedModel,
          actualProvider: candidate.adapter.id,
          actualModel: candidate.model.id,
          modality,
          fallbackOccurred,
          attemptsCount,
          latencyMs,
          statusCode: 200,
          createdAt: new Date(),
        });

        const result: ExecutionResult = {
          response,
          actualProvider: candidate.adapter.id,
          actualModel: candidate.model.id,
          requestedModel,
          fallbackOccurred,
          attemptsCount,
          latencyMs,
        };

        callbacks.onComplete?.(result);
        return result;
      } catch (err: any) {
        const normalized = candidate.adapter.normalizeError(err);
        const category: ErrorCategory = normalized.category;

        logger.warn(
          `[${correlationId}] Streaming attempt ${attemptsCount} failed on ${candidate.adapter.id}:${candidate.model.modelIdentifier} (${category}): ${normalized.message}`
        );

        lastError = new AppError(
          normalized.message,
          category,
          err.statusCode || (category === 'RATE_LIMITED' || category === 'QUOTA_EXHAUSTED' ? 429 : 502),
          normalized.retryAfterSeconds
        );

        // First-token streaming safety rule:
        // Once output has started being emitted to the client, NEVER switch providers!
        if (firstChunkEmitted) {
          logger.error(
            `[${correlationId}] Streaming error occurred after output began. Prohibiting failover to prevent corruption.`
          );

          await auditRepository.recordLog({
            correlationId,
            sessionId,
            clientType,
            requestedModel,
            actualProvider: candidate.adapter.id,
            actualModel: candidate.model.id,
            modality,
            fallbackOccurred,
            attemptsCount,
            latencyMs: Date.now() - startTime,
            statusCode: lastError.statusCode,
            errorCategory: category,
            createdAt: new Date(),
          });

          throw lastError;
        }

        // Output has not yet begun, so failover is safe
        if (ErrorClassifier.isFallbackEligible(category)) {
          await cooldownManager.markCooldown(
            candidate.adapter.id,
            candidate.model.id,
            category,
            normalized.message,
            normalized.retryAfterSeconds,
            cooldownConfig
          );

          fallbackOccurred = true;

          if (i + 1 < limit) {
            const backoffMs = Math.min(1000 * Math.pow(1.5, i) + Math.random() * 200, 3000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
        } else {
          await auditRepository.recordLog({
            correlationId,
            sessionId,
            clientType,
            requestedModel,
            actualProvider: candidate.adapter.id,
            actualModel: candidate.model.id,
            modality,
            fallbackOccurred,
            attemptsCount,
            latencyMs: Date.now() - startTime,
            statusCode: lastError.statusCode,
            errorCategory: category,
            createdAt: new Date(),
          });

          throw lastError;
        }
      }
    }

    const totalLatencyMs = Date.now() - startTime;

    await auditRepository.recordLog({
      correlationId,
      sessionId,
      clientType,
      requestedModel,
      modality,
      fallbackOccurred,
      attemptsCount,
      latencyMs: totalLatencyMs,
      statusCode: lastError?.statusCode || 503,
      errorCategory: lastError?.category || 'PROVIDER_UNAVAILABLE',
      createdAt: new Date(),
    });

    throw (
      lastError ||
      new AppError(
        `All ${attemptsCount} attempts across configured providers failed`,
        'PROVIDER_UNAVAILABLE',
        503
      )
    );
  }
}

export const fallbackExecutor = new FallbackExecutor();
