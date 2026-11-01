import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Validates a user-supplied candidate password against the configured AUTH_PASSWORD.
 * Uses crypto.timingSafeEqual on SHA-256 hashes to guarantee constant-time comparison
 * and prevent timing attacks regardless of length.
 *
 * @param candidate Password provided by the client (via header or request body)
 * @returns true if valid, false otherwise
 */
export function verifyAuthPassword(candidate?: string): boolean {
  if (!candidate || typeof candidate !== 'string') {
    return false;
  }

  const expectedPassword = env.AUTH_PASSWORD;
  if (!expectedPassword || typeof expectedPassword !== 'string') {
    return false;
  }

  // Pre-hash both strings to SHA-256 to ensure identical 32-byte buffers for timingSafeEqual
  const candidateHash = crypto.createHash('sha256').update(Buffer.from(candidate, 'utf8')).digest();
  const expectedHash = crypto.createHash('sha256').update(Buffer.from(expectedPassword, 'utf8')).digest();

  return crypto.timingSafeEqual(candidateHash, expectedHash);
}
