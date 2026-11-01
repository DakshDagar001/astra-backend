import { getDbPool } from '../connection.js';
import { env } from '../../config/env.js';

export interface ProviderHealthRecord {
  id: string; // providerId or providerId:modelId
  providerId: string;
  modelId?: string | null;
  status: 'AVAILABLE' | 'COOLDOWN' | 'DEGRADED' | 'UNAVAILABLE';
  cooldownUntil?: Date | null;
  errorCategory?: string | null;
  lastErrorMessage?: string | null;
  failureCount: number;
  updatedAt: Date;
}

const memoryHealth = new Map<string, ProviderHealthRecord>();

export class HealthRepository {
  private useMemory(): boolean {
    return !env.DATABASE_URL;
  }

  async setRecord(record: ProviderHealthRecord): Promise<void> {
    memoryHealth.set(record.id, { ...record });

    if (!this.useMemory()) {
      try {
        const pool = getDbPool();
        await pool.query(
          `INSERT INTO provider_health_records (
            id, provider_id, model_id, status, cooldown_until,
            error_category, last_error_message, failure_count, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            cooldown_until = EXCLUDED.cooldown_until,
            error_category = EXCLUDED.error_category,
            last_error_message = EXCLUDED.last_error_message,
            failure_count = EXCLUDED.failure_count,
            updated_at = EXCLUDED.updated_at`,
          [
            record.id,
            record.providerId,
            record.modelId || null,
            record.status,
            record.cooldownUntil || null,
            record.errorCategory || null,
            record.lastErrorMessage || null,
            record.failureCount,
            record.updatedAt,
          ]
        );
      } catch {}
    }
  }

  async getRecord(id: string): Promise<ProviderHealthRecord | null> {
    if (this.useMemory() || memoryHealth.has(id)) {
      return memoryHealth.get(id) || null;
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT id, provider_id as "providerId", model_id as "modelId",
                status, cooldown_until as "cooldownUntil",
                error_category as "errorCategory", last_error_message as "lastErrorMessage",
                failure_count as "failureCount", updated_at as "updatedAt"
         FROM provider_health_records WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (res.rows.length === 0) return null;
      return res.rows[0];
    } catch {
      return memoryHealth.get(id) || null;
    }
  }

  async getAllRecords(): Promise<ProviderHealthRecord[]> {
    if (this.useMemory()) {
      return Array.from(memoryHealth.values());
    }

    try {
      const pool = getDbPool();
      const res = await pool.query(
        `SELECT id, provider_id as "providerId", model_id as "modelId",
                status, cooldown_until as "cooldownUntil",
                error_category as "errorCategory", last_error_message as "lastErrorMessage",
                failure_count as "failureCount", updated_at as "updatedAt"
         FROM provider_health_records`
      );
      return res.rows;
    } catch {
      return Array.from(memoryHealth.values());
    }
  }
}

export const healthRepository = new HealthRepository();
