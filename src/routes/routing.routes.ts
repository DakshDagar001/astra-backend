import { Router, Request, Response, NextFunction } from 'express';
import { routingRepository } from '../database/repositories/routing.repository.js';
import { healthRepository } from '../database/repositories/health.repository.js';
import { auditRepository } from '../database/repositories/audit.repository.js';
import { modelRegistry } from '../models/model.registry.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { updateRoutingConfigSchema } from '../validators/routing.validator.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/v1/routing/config
router.get('/config', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const config = await routingRepository.getConfig();
    res.status(200).json({
      success: true,
      data: {
        config,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/routing/config
router.put(
  '/config',
  requireAuth,
  validateBody(updateRoutingConfigSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updates = req.body;
      const allModels = await modelRegistry.listModels();
      const validModelIds = new Set(allModels.map((m) => m.id));

      // Validate pinnedModelId if provided
      if (updates.pinnedModelId && !validModelIds.has(updates.pinnedModelId)) {
        throw new AppError(
          `Invalid pinned model ID: ${updates.pinnedModelId}. Must exist in backend model registry.`,
          'INVALID_REQUEST',
          400
        );
      }

      // Validate text priority models
      if (updates.textPriorityModels) {
        for (const id of updates.textPriorityModels) {
          if (!validModelIds.has(id)) {
            throw new AppError(
              `Invalid model ID in text priorities: ${id}. Must exist in backend model registry.`,
              'INVALID_REQUEST',
              400
            );
          }
        }
      }

      // Validate vision priority models
      if (updates.visionPriorityModels) {
        for (const id of updates.visionPriorityModels) {
          const m = allModels.find((item) => item.id === id);
          if (!m) {
            throw new AppError(
              `Invalid model ID in vision priorities: ${id}. Must exist in backend model registry.`,
              'INVALID_REQUEST',
              400
            );
          }
          if (!m.supportsVision) {
            throw new AppError(
              `Model ${id} does not support vision and cannot be added to vision priorities`,
              'UNSUPPORTED_CAPABILITY',
              400
            );
          }
        }
      }

      const updated = await routingRepository.updateConfig(updates);
      res.status(200).json({
        success: true,
        data: {
          config: updated,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/routing/status
router.get('/status', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const config = await routingRepository.getConfig();
    const allModels = await modelRegistry.listModels();
    const activeModels = allModels.filter((m) => m.isConfigured && m.status === 'AVAILABLE');
    const cooldownModels = allModels.filter((m) => m.status === 'COOLDOWN');

    res.status(200).json({
      success: true,
      data: {
        mode: config.mode,
        pinnedModelId: config.pinnedModelId,
        fallbackEnabled: config.fallbackEnabled,
        maxAttempts: config.maxAttempts,
        totalModelsRegistered: allModels.length,
        availableModelsCount: activeModels.length,
        cooldownModelsCount: cooldownModels.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/routing/health
router.get('/health', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const records = await healthRepository.getAllRecords();
    res.status(200).json({
      success: true,
      data: {
        records,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/routing/usage
router.get('/usage', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const logs = await auditRepository.getRecentLogs(50);
    res.status(200).json({
      success: true,
      data: {
        recentRequests: logs,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const routingRoutes = router;
