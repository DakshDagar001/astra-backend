import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbPool } from './connection.js';
import { Logger } from '../logging/logger.js';
import { env } from '../config/env.js';

const logger = new Logger('Migrator');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  if (!env.DATABASE_URL) {
    logger.info('Skipping database migrations: DATABASE_URL not provided');
    return;
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    logger.info('Checking migration status in PostgreSQL...');
    
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Look for migration files in migrations directory
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    if (!fs.existsSync(migrationsDir)) {
      logger.warn(`Migrations directory not found at ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      );

      if (alreadyApplied.rows.length === 0) {
        logger.info(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info(`Successfully applied migration: ${file}`);
      } else {
        logger.debug(`Migration ${file} already applied`);
      }
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to run database migrations', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

// Standalone execution if invoked directly
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
