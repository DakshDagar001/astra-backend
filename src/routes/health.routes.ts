import { Router, Request, Response } from 'express';
import { providerRegistry } from '../providers/registry/provider.registry.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const memory = process.memoryUsage();
  const providers = providerRegistry.listProviders();
  const configuredProviders = providers.filter((p) => p.isConfigured).length;

  res.status(200).json({
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    providers: {
      total: providers.length,
      configured: configuredProviders,
    },
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    },
  });
});

export const healthRoutes = router;
