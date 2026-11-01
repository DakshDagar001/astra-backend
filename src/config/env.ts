import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().optional(),

  // Single-User Simplified Authentication
  AUTH_PASSWORD: z.string().default('astra-dev-password'),

  // Rate Limiting
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(10),
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
    if (!data.AUTH_PASSWORD || data.AUTH_PASSWORD.trim() === '' || data.AUTH_PASSWORD === 'astra-dev-password') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_PASSWORD'],
        message: 'FATAL: AUTH_PASSWORD is required in production environment. Please set AUTH_PASSWORD.',
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
    AUTH_PASSWORD: process.env.AUTH_PASSWORD || 'astra-dev-password',
  });
}

export const env = parsedEnv;
