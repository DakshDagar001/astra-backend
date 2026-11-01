import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { Logger } from './logging/logger.js';
import { runMigrations } from './database/migrate.js';
import { getDbPool } from './database/connection.js';

const logger = new Logger('Server');

async function startServer(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  // Attempt migrations if DATABASE_URL is set
  if (env.DATABASE_URL) {
    try {
      await runMigrations();
    } catch (err: any) {
      logger.error('Failed to run database migrations during startup', { error: err.message });
      if (env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  } else {
    logger.info('No DATABASE_URL configured. Running with in-memory persistence.');
  }

  server.listen(env.PORT, () => {
    logger.info(`Astra AI Central Backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Health check available at http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      if (env.DATABASE_URL) {
        try {
          const pool = getDbPool();
          await pool.end();
          logger.info('PostgreSQL pool disconnected.');
        } catch {}
      }
      logger.info('Server shutdown complete.');
      process.exit(0);
    });

    // Force shutdown if hung
    setTimeout(() => {
      logger.error('Force shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error('Fatal error during server startup', { error: err.message });
  process.exit(1);
});
