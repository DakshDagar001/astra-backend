import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().optional(),
  
  // Security & Authentication
  ASTRA_PASSWORD_HASH: z.string().default('$argon2id$v=19$m=65536,t=3,p=4$dummy_hash_for_testing'),
  ASTRA_JWT_SECRET: z.string().min(16).default('astra_jwt_default_dev_secret_key_change_in_production_32chars'),
  ACCESS_TOKEN_EXPIRY_SECONDS: z.coerce.number().default(900), // 15 mins
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(30), // 30 days
  
  // Rate Limiting
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60 * 1000), // 1 min
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(120),

  // Provider API Keys (backend-only)
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  HUGGINGFACE_API_KEY: z.string().optional(),
  NVIDIA_NIM_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  DEEPINFRA_API_KEY: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.DATABASE_URL || data.DATABASE_URL.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production environment',
      });
    }
    if (!data.ASTRA_JWT_SECRET || data.ASTRA_JWT_SECRET === 'astra_jwt_default_dev_secret_key_change_in_production_32chars' || data.ASTRA_JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASTRA_JWT_SECRET'],
        message: 'A secure, non-default ASTRA_JWT_SECRET (>= 32 chars) is required in production',
      });
    }
    if (!data.ASTRA_PASSWORD_HASH || data.ASTRA_PASSWORD_HASH === '$argon2id$v=19$m=65536,t=3,p=4$dummy_hash_for_testing') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASTRA_PASSWORD_HASH'],
        message: 'A production Argon2id ASTRA_PASSWORD_HASH is required in production',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: Invalid backend environment configuration in production:');
    if (error instanceof z.ZodError) {
      console.error(JSON.stringify(error.format(), null, 2));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
  if (error instanceof z.ZodError) {
    console.warn('Backend environment configuration warning (using development defaults):', error.format());
  }
  parsedEnv = envSchema.parse({
    NODE_ENV: 'development',
    PORT: 4000,
    ASTRA_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$dummy_hash_for_testing',
    ASTRA_JWT_SECRET: 'astra_jwt_default_dev_secret_key_change_in_production_32chars',
  });
}

export const env = parsedEnv;
