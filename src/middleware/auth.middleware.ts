import { Request, Response, NextFunction } from 'express';
import { verifyAuthPassword } from '../auth/simple-auth.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { env } from '../config/env.js';
import { AuthenticationError } from '../utils/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        role: string;
        sessionId?: string;
        deviceId?: string;
        clientType?: string;
      };
      correlationId?: string;
    }
  }
}

/**
 * Validates authentication on protected routes.
 * Supports:
 *   1. X-Astra-Password: <password>
 *   2. Authorization: Bearer <password>
 *   3. Session token payloads (for backward compatibility and session isolation)
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  let candidatePassword = req.headers['x-astra-password'] as string | undefined;
  let tokenPayload: any = null;

  if (candidatePassword && verifyAuthPassword(candidatePassword)) {
    // Valid password header
  } else if (req.headers.authorization) {
    const authHeader = req.headers.authorization;
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();

    if (verifyAuthPassword(token)) {
      candidatePassword = token;
    } else {
      try {
        tokenPayload = verifyAccessToken(token);
        candidatePassword = env.AUTH_PASSWORD;
      } catch {
        candidatePassword = undefined;
      }
    }
  }

  if (!candidatePassword || !verifyAuthPassword(candidatePassword)) {
    throw new AuthenticationError('Invalid or missing authentication password');
  }

  req.user = {
    sub: tokenPayload?.sub || 'owner',
    role: 'owner',
    sessionId: (req.headers['x-session-id'] as string) || tokenPayload?.sessionId || 'default-session',
    deviceId: (req.headers['x-device-id'] as string) || tokenPayload?.deviceId || 'device-test-api',
    clientType: (req.headers['x-client-type'] as string) || tokenPayload?.clientType || 'desktop',
  };

  next();
}
