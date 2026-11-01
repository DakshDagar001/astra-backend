import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Redact Bearer tokens, long base64 strings, or key patterns
    if (obj.length > 200 && !obj.includes(' ') && (obj.startsWith('data:image') || /^[A-Za-z0-9+/=]+$/.test(obj))) {
      return '[REDACTED_PAYLOAD_OR_IMAGE]';
    }
    return obj
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(?:key|secret|password|token)=["']?[^"'\s&]+["']?/gi, '$1=[REDACTED]');
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }
  if (typeof obj === 'object') {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('key') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('image') ||
        lowerKey.includes('prompt')
      ) {
        if (lowerKey.includes('prompt') && typeof value === 'string') {
          redacted[key] = `[PROMPT_REDACTED len=${value.length}]`;
        } else if (lowerKey.includes('image')) {
          redacted[key] = '[IMAGE_DATA_REDACTED]';
        } else {
          redacted[key] = '[REDACTED]';
        }
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }
  return obj;
}

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[env.LOG_LEVEL];
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? JSON.stringify(redactSensitiveData(meta)) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}]: ${message} ${cleanMeta}`.trim();
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }
}

export const appLogger = new Logger('App');
