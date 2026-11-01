import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { Logger } from './logging/logger.js';

const logger = new Logger('Server');

async function startServer(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`Astra AI Central Backend running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Single-user authentication enabled via AUTH_PASSWORD`);
    logger.info(`Health check available at http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    server.close(() => {
      logger.info('Server shutdown complete.');
      process.exit(0);
    });

    // Force shutdown if hung
    setTimeout(() => {
      logger.error('Force shutdown after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error('Fatal error during server startup', { error: err.message });
  process.exit(1);
});
