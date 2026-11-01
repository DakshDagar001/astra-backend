import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database/connection.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();
  const memory = process.memoryUsage();

  res.status(dbHealth.ok ? 200 : 503).json({
    status: dbHealth.ok ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbHealth,
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    },
  });
});

export const healthRoutes = router;
