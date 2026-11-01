import { Router, Request, Response, NextFunction } from 'express';
import { modelRegistry } from '../models/model.registry.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// GET /api/v1/models
router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const models = await modelRegistry.listModels();
    res.status(200).json({
      success: true,
      data: {
        models,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/models/:id
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const model = await modelRegistry.getModel(id);
    if (!model) {
      throw new AppError(`Model not found: ${id}`, 'MODEL_UNAVAILABLE', 404);
    }
    res.status(200).json({
      success: true,
      data: {
        model,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const modelRoutes = router;
