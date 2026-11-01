import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SYSTEM_CONSTANTS } from '../config/constants.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers[SYSTEM_CONSTANTS.HEADER_CORRELATION_ID] as string;
  const correlationId = incomingId && incomingId.trim().length > 0 ? incomingId.trim() : uuidv4();
  req.correlationId = correlationId;
  res.setHeader(SYSTEM_CONSTANTS.HEADER_CORRELATION_ID, correlationId);
  next();
}
