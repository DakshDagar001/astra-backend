import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { Logger } from '../logging/logger.js';
import { env } from '../config/env.js';

const logger = new Logger('ErrorHandler');

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[${correlationId}] Operational Server Error: ${err.message}`, {
        category: err.category,
        statusCode: err.statusCode,
      });
    } else {
      logger.warn(`[${correlationId}] Client Error: ${err.message}`, {
        category: err.category,
        statusCode: err.statusCode,
      });
    }

    if (err.retryAfterSeconds) {
      res.setHeader('Retry-After', err.retryAfterSeconds);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        category: err.category,
        correlationId,
        details: err.details,
      },
    });
    return;
  }

  // Unhandled internal error
  logger.error(`[${correlationId}] Unhandled Internal Error: ${err.message}`, {
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: {
      message: 'An unexpected internal error occurred',
      category: 'UNKNOWN_ERROR',
      correlationId,
    },
  });
}
