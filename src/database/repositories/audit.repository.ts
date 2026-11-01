import { getDbPool } from '../connection.js';
import { env } from '../../config/env.js';

export interface AuditLogRecord {
  correlationId: string;
  sessionId?: string | null;
  clientType?: string | null;
  requestedModel: string;
  actualProvider?: string | null;
  actualModel?: string | null;
  modality: 'text' | 'vision';
  fallbackOccurred: boolean;
  attemptsCount: number;
  latencyMs: number;
  statusCode: number;
  errorCategory?: string | null;
  createdAt: Date;
}

const memoryLogs: AuditLogRecord[] = [];

export class AuditRepository {
  private useMemory(): boolean {
    return !env.DATABASE_URL;
  }

  async recordLog(entry: AuditLogRecord): Promise<void> {
    memoryLogs.push(entry);
    if (memoryLogs.length > 1000) {
      memoryLogs.shift();
    }

    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO request_audit_logs (
            correlation_id, session_id, client_type, requested_model,
            actual_provider, actual_model, modality, fallback_occurred,
            attempts_count, latency_ms, status_code, error_category, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            entry.correlationId,
            entry.sessionId || null,
            entry.clientType || null,
            entry.requestedModel,
            entry.actualProvider || null,
            entry.actualModel || null,
            entry.modality,
            entry.fallbackOccurred,
            entry.attemptsCount,
            entry.latencyMs,
            entry.statusCode,
            entry.errorCategory || null,
            entry.createdAt,
          ]
        );
      } catch {}
    }
  }

  async getRecentLogs(limit = 50): Promise<AuditLogRecord[]> {
    if (this.useMemory()) {
      return [...memoryLogs].reverse().slice(0, limit);
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT correlation_id as "correlationId", session_id as "sessionId",
                client_type as "clientType", requested_model as "requestedModel",
                actual_provider as "actualProvider", actual_model as "actualModel",
                modality, fallback_occurred as "fallbackOccurred",
                attempts_count as "attemptsCount", latency_ms as "latencyMs",
                status_code as "statusCode", error_category as "errorCategory",
                created_at as "createdAt"
         FROM request_audit_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    } catch {
      return [...memoryLogs].reverse().slice(0, limit);
    }
  }
}

export const auditRepository = new AuditRepository();
