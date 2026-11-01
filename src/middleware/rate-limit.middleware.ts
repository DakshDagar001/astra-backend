import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { RateLimitError } from '../utils/errors.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const loginIpBuckets = new Map<string, RateLimitBucket>();
const apiIpBuckets = new Map<string, RateLimitBucket>();

export function loginRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = loginIpBuckets.get(ip) || { count: 0, resetAt: now + env.LOGIN_RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + env.LOGIN_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count++;
  loginIpBuckets.set(ip, bucket);

  if (bucket.count > env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw new RateLimitError(`Too many login attempts. Please try again in ${retryAfter} seconds.`, retryAfter);
  }

  next();
}

export function apiRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = apiIpBuckets.get(ip) || { count: 0, resetAt: now + env.API_RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + env.API_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count++;
  apiIpBuckets.set(ip, bucket);

  if (bucket.count > env.API_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw new RateLimitError('API rate limit exceeded', retryAfter);
  }

  next();
}

export function resetRateLimitsForTesting(): void {
  loginIpBuckets.clear;
  loginIpBuckets.clear();
  apiIpBuckets.clear();
}
