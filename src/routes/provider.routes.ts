import { Router, Request, Response, NextFunction } from 'express';
import { providerRegistry } from '../providers/registry/provider.registry.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/v1/providers
router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const providers = providerRegistry.listProviders();
    res.status(200).json({
      success: true,
      data: {
        providers,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const providerRoutes = router;
