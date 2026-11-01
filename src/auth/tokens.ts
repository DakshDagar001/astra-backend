import { verifyAuthPassword } from './simple-auth.js';
import { AuthenticationError } from '../utils/errors.js';

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  deviceId: string;
  clientType: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  if (verifyAuthPassword(token)) {
    return {
      sub: 'admin',
      sessionId: 'default-session',
      deviceId: 'default-device',
      clientType: 'desktop',
    };
  }

  try {
    const json = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (json && json.sub) {
      return json as AccessTokenPayload;
    }
  } catch {}

  throw new AuthenticationError('Invalid authentication token');
}

export function generateOpaqueRefreshToken(): string {
  return 'default-refresh-token';
}

export function hashRefreshToken(token: string): string {
  return token;
}
