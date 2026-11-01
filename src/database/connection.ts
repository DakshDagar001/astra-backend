import pg from 'pg';
import { env } from '../config/env.js';
import { Logger } from '../logging/logger.js';

const { Pool } = pg;
const logger = new Logger('Database');

let pool: pg.Pool | null = null;
let isConnected = false;

export function getDbPool(): pg.Pool {
  if (!pool) {
    if (!env.DATABASE_URL) {
      logger.warn('DATABASE_URL is not set. Operating in in-memory / mock storage mode.');
      // Return a dummy pool that throws if queried directly without DB
      pool = new Pool({ connectionString: 'postgresql://localhost:5432/dummy' });
      return pool;
    }

    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
    });
  }

  return pool;
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; message: string }> {
  if (!env.DATABASE_URL) {
    return { ok: true, message: 'In-memory / unconfigured mode' };
  }
  try {
    const p = getDbPool();
    const res = await p.query('SELECT 1 as alive');
    isConnected = res.rows.length > 0;
    return { ok: true, message: 'Connected to PostgreSQL' };
  } catch (err: any) {
    isConnected = false;
    return { ok: false, message: `PostgreSQL error: ${err.message}` };
  }
}

export function isDbConnected(): boolean {
  return isConnected;
}
