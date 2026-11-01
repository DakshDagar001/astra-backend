import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { aireEngine } from '../routing/AIRE/aire-engine.js';
import { providerRegistry } from '../providers/registry/provider.registry.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { chatRequestSchema, testConnectionSchema } from '../validators/ai.validator.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// POST /api/v1/ai/chat
router.post(
  '/chat',
  requireAuth,
  validateBody(chatRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { prompt, modelId, responseMode, images, temperature, maxTokens } = req.body;
      const correlationId = req.correlationId || uuidv4();

      const result = await aireEngine.processRequest(
        {
          requestId: correlationId,
          prompt,
          responseMode,
          images,
          modelIdentifier: modelId || '',
          temperature,
          maxTokens,
        },
        {
          correlationId,
          sessionId: req.user?.sessionId,
          clientType: req.user?.clientType,
          modelOverride: modelId,
        }
      );

      res.status(200).json({
        success: true,
        data: {
          text: result.response.text,
          metadata: {
            requestedModel: result.requestedModel,
            actualProvider: result.actualProvider,
            actualModel: result.actualModel,
            fallbackOccurred: result.fallbackOccurred,
            attemptsCount: result.attemptsCount,
            latencyMs: result.latencyMs,
            usage: result.response.usage,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/ai/chat/stream
router.post(
  '/chat/stream',
  requireAuth,
  validateBody(chatRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || uuidv4();
    const abortController = new AbortController();

    // Detect premature client disconnect on the response stream
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });
    req.on('aborted', () => {
      abortController.abort();
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('start', { correlationId });

    try {
      const { prompt, modelId, responseMode, images, temperature, maxTokens } = req.body;

      await aireEngine.processStreamingRequest(
        {
          requestId: correlationId,
          prompt,
          responseMode,
          images,
          modelIdentifier: modelId || '',
          temperature,
          maxTokens,
          abortSignal: abortController.signal,
        },
        {
          correlationId,
          sessionId: req.user?.sessionId,
          clientType: req.user?.clientType,
          modelOverride: modelId,
        },
        {
          onStart: (meta) => {
            sendEvent('metadata', meta);
          },
          onChunk: (chunk) => {
            sendEvent('token', { text: chunk });
          },
          onComplete: (result) => {
            sendEvent('complete', {
              text: result.response.text,
              metadata: {
                requestedModel: result.requestedModel,
                actualProvider: result.actualProvider,
                actualModel: result.actualModel,
                fallbackOccurred: result.fallbackOccurred,
                attemptsCount: result.attemptsCount,
                latencyMs: result.latencyMs,
                usage: result.response.usage,
              },
            });
            res.end();
          },
        }
      );
    } catch (err: any) {
      const category = err?.category || 'UNKNOWN_ERROR';
      const message = err?.message || 'Streaming request failed';
      sendEvent('error', { category, message });
      res.end();
    }
  }
);

// POST /api/v1/ai/test-connection
router.post(
  '/test-connection',
  requireAuth,
  validateBody(testConnectionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { providerId, modelId } = req.body;
      const correlationId = req.correlationId || uuidv4();

      let targetModelId = modelId;
      if (!targetModelId && providerId) {
        const provider = providerRegistry.getProvider(providerId);
        if (!provider) {
          throw new AppError(`Unknown provider: ${providerId}`, 'INVALID_REQUEST', 400);
        }
        targetModelId = provider.getProviderMetadata().defaultModel;
      }

      const result = await aireEngine.processRequest(
        {
          requestId: correlationId,
          prompt: 'Respond with OK to verify API connectivity.',
          modelIdentifier: targetModelId || '',
          temperature: 0,
          maxTokens: 10,
        },
        {
          correlationId,
          sessionId: req.user?.sessionId,
          clientType: req.user?.clientType,
          modelOverride: targetModelId,
        }
      );

      res.status(200).json({
        success: true,
        data: {
          status: 'CONNECTED',
          message: 'Connection test passed successfully',
          actualProvider: result.actualProvider,
          actualModel: result.actualModel,
          latencyMs: result.latencyMs,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export const aiRoutes = router;
