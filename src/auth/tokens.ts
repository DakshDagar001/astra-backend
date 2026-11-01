import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticationError } from '../utils/errors.js';

export interface AccessTokenPayload {
  sub: string; // 'owner'
  sessionId: string;
  deviceId: string;
  clientType: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.ASTRA_JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRY_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.ASTRA_JWT_SECRET) as AccessTokenPayload;
  } catch (err: any) {
    throw new AuthenticationError(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token'
    );
  }
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
