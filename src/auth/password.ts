import argon2 from 'argon2';
import { env } from '../config/env.js';
import { Logger } from '../logging/logger.js';

const logger = new Logger('AuthPassword');

export async function verifyApplicationPassword(password: string): Promise<boolean> {
  if (!password || typeof password !== 'string') {
    return false;
  }

  const expectedHash = env.ASTRA_PASSWORD_HASH;
  if (!expectedHash || expectedHash.startsWith('$argon2id$v=19$m=65536,t=3,p=4$dummy_hash_for_testing')) {
    // If running in development without a configured hash, allow a dev fallback password if explicitly configured
    if (env.NODE_ENV === 'development' && password === 'astra_dev_password') {
      logger.warn('Authenticated using default development password. Configure ASTRA_PASSWORD_HASH for security.');
      return true;
    }
  }

  try {
    return await argon2.verify(expectedHash, password);
  } catch (err: any) {
    logger.error('Argon2 verification failed', { error: err.message });
    return false;
  }
}

export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}
