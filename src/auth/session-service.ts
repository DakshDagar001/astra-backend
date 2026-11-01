import { v4 as uuidv4 } from 'uuid';
import { verifyAuthPassword } from './simple-auth.js';
import { AuthenticationError } from '../utils/errors.js';
import { Logger } from '../logging/logger.js';

const logger = new Logger('SessionService');

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  clientType: string;
  clientVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  sessionId: string;
  deviceId: string;
}

export class SessionService {
  async login(password: string, device: DeviceInfo): Promise<AuthResult> {
    const isValid = verifyAuthPassword(password);
    if (!isValid) {
      logger.warn('Failed login attempt', { clientType: device.clientType, ip: device.ipAddress });
      throw new AuthenticationError('Invalid credentials');
    }

    const sessionId = uuidv4();
    logger.info('Session created successfully', { sessionId, clientType: device.clientType, deviceId: device.deviceId });

    return {
      accessToken: password,
      refreshToken: password,
      expiresInSeconds: 86400 * 30,
      sessionId,
      deviceId: device.deviceId,
    };
  }

  async refresh(refreshToken: string, device: Partial<DeviceInfo>): Promise<AuthResult> {
    const isValid = verifyAuthPassword(refreshToken);
    if (!isValid) {
      throw new AuthenticationError('Invalid refresh token');
    }

    const sessionId = uuidv4();
    return {
      accessToken: refreshToken,
      refreshToken,
      expiresInSeconds: 86400 * 30,
      sessionId,
      deviceId: device.deviceId || 'default-device',
    };
  }

  async logout(_refreshToken: string): Promise<void> {
    logger.info('Session logged out');
  }

  async revokeSessionFamily(_sessionId: string): Promise<void> {
    logger.info('Revoked session family');
  }
}

export const sessionService = new SessionService();
