import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { verifyApplicationPassword } from './password.js';
import {
  generateAccessToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from './tokens.js';
import { sessionRepository, SessionRecord } from '../database/repositories/session.repository.js';
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
    const isValid = await verifyApplicationPassword(password);
    if (!isValid) {
      logger.warn('Failed login attempt', { clientType: device.clientType, ip: device.ipAddress });
      throw new AuthenticationError('Invalid credentials');
    }

    const sessionId = uuidv4();
    const refreshToken = generateOpaqueRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const record: SessionRecord = {
      id: uuidv4(),
      sessionId,
      tokenHash,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      clientType: device.clientType,
      clientVersion: device.clientVersion,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
      expiresAt,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    await sessionRepository.createSession(record);

    const accessToken = generateAccessToken({
      sub: 'owner',
      sessionId,
      deviceId: device.deviceId,
      clientType: device.clientType,
    });

    logger.info('Session created successfully', {
      sessionId,
      clientType: device.clientType,
      deviceId: device.deviceId,
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: env.ACCESS_TOKEN_EXPIRY_SECONDS,
      sessionId,
      deviceId: device.deviceId,
    };
  }

  async refresh(refreshToken: string, device?: Partial<DeviceInfo>): Promise<AuthResult> {
    if (!refreshToken) {
      throw new AuthenticationError('Refresh token required');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await sessionRepository.findByTokenHash(tokenHash);

    if (!existing) {
      logger.warn('Refresh token not found');
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Token reuse detection!
    // If this token was already replaced or revoked, another entity might be attempting a replay attack.
    if (existing.revokedAt || existing.replacedBy) {
      logger.error('CRITICAL: Refresh token reuse detected! Revoking token family', {
        sessionId: existing.sessionId,
      });
      await sessionRepository.revokeAllBySessionId(existing.sessionId, 'token_reuse_detected');
      throw new AuthenticationError('Session invalidated due to token reuse');
    }

    // Check expiration
    if (new Date() > existing.expiresAt) {
      await sessionRepository.revokeSession(existing.id, 'expired');
      throw new AuthenticationError('Session expired');
    }

    // Issue new rotating token
    const newRefreshToken = generateOpaqueRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const newSessionRecordId = uuidv4();

    // Mark current token as replaced
    await sessionRepository.revokeSession(existing.id, 'rotated');

    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const updatedRecord: SessionRecord = {
      id: newSessionRecordId,
      sessionId: existing.sessionId, // Keep same session family
      tokenHash: newTokenHash,
      deviceId: device?.deviceId || existing.deviceId,
      deviceName: device?.deviceName || existing.deviceName,
      clientType: device?.clientType || existing.clientType,
      clientVersion: device?.clientVersion || existing.clientVersion,
      ipAddress: device?.ipAddress || existing.ipAddress,
      userAgent: device?.userAgent || existing.userAgent,
      expiresAt,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    await sessionRepository.createSession(updatedRecord);

    const accessToken = generateAccessToken({
      sub: 'owner',
      sessionId: existing.sessionId,
      deviceId: updatedRecord.deviceId,
      clientType: updatedRecord.clientType,
    });

    logger.debug('Refreshed token rotated', { sessionId: existing.sessionId });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresInSeconds: env.ACCESS_TOKEN_EXPIRY_SECONDS,
      sessionId: existing.sessionId,
      deviceId: updatedRecord.deviceId,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await sessionRepository.findByTokenHash(tokenHash);
    if (existing) {
      await sessionRepository.revokeSession(existing.id, 'user_logout');
      logger.info('Session logged out', { sessionId: existing.sessionId });
    }
  }

  async listActiveSessions(): Promise<Omit<SessionRecord, 'tokenHash'>[]> {
    return sessionRepository.listActiveSessions();
  }

  async revokeSessionById(id: string): Promise<void> {
    await sessionRepository.revokeSession(id, 'admin_revocation');
    logger.info('Session revoked by ID', { id });
  }
}

export const sessionService = new SessionService();
