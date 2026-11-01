import { getDbPool } from '../connection.js';
import { env } from '../../config/env.js';
import { Logger } from '../../logging/logger.js';

export interface SessionRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  deviceId: string;
  deviceName: string;
  clientType: string;
  clientVersion: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  replacedBy?: string | null;
}

const logger = new Logger('SessionRepository');

// In-memory fallback cache
const memorySessions = new Map<string, SessionRecord>();

export class SessionRepository {
  private useMemory(): boolean {
    return !env.DATABASE_URL;
  }

  async createSession(session: SessionRecord): Promise<void> {
    if (this.useMemory()) {
      memorySessions.set(session.id, { ...session });
      return;
    }

    const pool = getDbPool();
    try {
      await pool.query(
        `INSERT INTO sessions (
          id, session_id, token_hash, device_id, device_name,
          client_type, client_version, ip_address, user_agent,
          expires_at, created_at, last_active_at, revoked_at,
          revoked_reason, replaced_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          session.id,
          session.sessionId,
          session.tokenHash,
          session.deviceId,
          session.deviceName,
          session.clientType,
          session.clientVersion,
          session.ipAddress || null,
          session.userAgent || null,
          session.expiresAt,
          session.createdAt,
          session.lastActiveAt,
          session.revokedAt || null,
          session.revokedReason || null,
          session.replacedBy || null,
        ]
      );
    } catch (err: any) {
      logger.warn('Failed to insert session into DB, falling back to memory', { error: err.message });
      memorySessions.set(session.id, { ...session });
    }
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (this.useMemory()) {
      for (const s of memorySessions.values()) {
        if (s.tokenHash === tokenHash) return { ...s };
      }
      return null;
    }

    const pool = getDbPool();
    try {
      const res = await pool.query(
        `SELECT id, session_id as "sessionId", token_hash as "tokenHash",
                device_id as "deviceId", device_name as "deviceName",
                client_type as "clientType", client_version as "clientVersion",
                ip_address as "ipAddress", user_agent as "userAgent",
                expires_at as "expiresAt", created_at as "createdAt",
                last_active_at as "lastActiveAt", revoked_at as "revokedAt",
                revoked_reason as "revokedReason", replaced_by as "replacedBy"
         FROM sessions WHERE token_hash = $1 LIMIT 1`,
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      return res.rows[0];
    } catch {
      for (const s of memorySessions.values()) {
        if (s.tokenHash === tokenHash) return { ...s };
      }
      return null;
    }
  }

  async findBySessionId(sessionId: string): Promise<SessionRecord[]> {
    if (this.useMemory()) {
      return Array.from(memorySessions.values()).filter(s => s.sessionId === sessionId);
    }

    const pool = getDbPool();
    try {
      const res = await pool.query(
        `SELECT id, session_id as "sessionId", token_hash as "tokenHash",
                device_id as "deviceId", device_name as "deviceName",
                client_type as "clientType", client_version as "clientVersion",
                ip_address as "ipAddress", user_agent as "userAgent",
                expires_at as "expiresAt", created_at as "createdAt",
                last_active_at as "lastActiveAt", revoked_at as "revokedAt",
                revoked_reason as "revokedReason", replaced_by as "replacedBy"
         FROM sessions WHERE session_id = $1 ORDER BY created_at DESC`,
        [sessionId]
      );
      return res.rows;
    } catch {
      return Array.from(memorySessions.values()).filter(s => s.sessionId === sessionId);
    }
  }

  async revokeSession(id: string, reason = 'user_logout'): Promise<void> {
    const now = new Date();
    if (memorySessions.has(id)) {
      const s = memorySessions.get(id)!;
      s.revokedAt = now;
      s.revokedReason = reason;
    }

    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query(
          `UPDATE sessions SET revoked_at = $1, revoked_reason = $2 WHERE id = $3`,
          [now, reason, id]
        );
      } catch (err: any) {
        logger.warn('Failed to update revoked session in DB', { error: err.message });
      }
    }
  }

  async revokeAllBySessionId(sessionId: string, reason = 'token_reuse_detected'): Promise<void> {
    const now = new Date();
    for (const s of memorySessions.values()) {
      if (s.sessionId === sessionId) {
        s.revokedAt = now;
        s.revokedReason = reason;
      }
    }

    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query(
          `UPDATE sessions SET revoked_at = $1, revoked_reason = $2 WHERE session_id = $3`,
          [now, reason, sessionId]
        );
      } catch (err: any) {
        logger.warn('Failed to revoke sessions by sessionId in DB', { error: err.message });
      }
    }
  }

  async updateLastActive(id: string): Promise<void> {
    const now = new Date();
    if (memorySessions.has(id)) {
      memorySessions.get(id)!.lastActiveAt = now;
    }
    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query('UPDATE sessions SET last_active_at = $1 WHERE id = $2', [now, id]);
      } catch {}
    }
  }

  async listActiveSessions(): Promise<Omit<SessionRecord, 'tokenHash'>[]> {
    const now = new Date();
    if (this.useMemory()) {
      return Array.from(memorySessions.values())
        .filter(s => !s.revokedAt && s.expiresAt > now)
        .map(({ tokenHash, ...rest }) => rest);
    }

    const pool = getDbPool();
    try {
      const res = await pool.query(
        `SELECT id, session_id as "sessionId",
                device_id as "deviceId", device_name as "deviceName",
                client_type as "clientType", client_version as "clientVersion",
                ip_address as "ipAddress", user_agent as "userAgent",
                expires_at as "expiresAt", created_at as "createdAt",
                last_active_at as "lastActiveAt"
         FROM sessions
         WHERE revoked_at IS NULL AND expires_at > $1
         ORDER BY last_active_at DESC`,
        [now]
      );
      return res.rows;
    } catch {
      return Array.from(memorySessions.values())
        .filter(s => !s.revokedAt && s.expiresAt > now)
        .map(({ tokenHash, ...rest }) => rest);
    }
  }

  clearMemoryForTesting(): void {
    memorySessions.clear();
  }
}

export const sessionRepository = new SessionRepository();
