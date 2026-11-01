import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../auth/tokens.js';
import { AuthenticationError } from '../utils/errors.js';
import { SYSTEM_CONSTANTS } from '../config/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      correlationId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith(SYSTEM_CONSTANTS.AUTH_HEADER_PREFIX)) {
    throw new AuthenticationError('Authorization header missing or malformed');
  }

  const token = authHeader.substring(SYSTEM_CONSTANTS.AUTH_HEADER_PREFIX.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}
