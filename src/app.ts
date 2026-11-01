import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { apiRateLimiter } from './middleware/rate-limit.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { providerRoutes } from './routes/provider.routes.js';
import { modelRoutes } from './routes/model.routes.js';
import { routingRoutes } from './routes/routing.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { AppError } from './utils/errors.js';

export function createApp(): Express {
  const app = express();

  // Security headers & CORS
  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Body parser with 25MB limit to allow base64 screenshots/images safely
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Correlation ID tracking
  app.use(requestIdMiddleware);

  // Health check endpoint (exempt from API rate limits)
  app.use('/health', healthRoutes);

  // Global API rate limiter
  app.use('/api', apiRateLimiter);

  // API v1 routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/providers', providerRoutes);
  app.use('/api/v1/models', modelRoutes);
  app.use('/api/v1/routing', routingRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1/conversations', conversationRoutes);

  // 404 handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('API endpoint not found', 'INVALID_REQUEST', 404));
  });

  // Central error handler
  app.use(errorHandler);

  return app;
}
