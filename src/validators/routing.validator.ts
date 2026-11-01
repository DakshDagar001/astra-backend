import { z } from 'zod';

export const updateRoutingConfigSchema = z.object({
  mode: z.enum(['automatic', 'manual']).optional(),
  pinnedModelId: z.string().nullable().optional(),
  fallbackEnabled: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  textPriorityModels: z.array(z.string()).optional(),
  visionPriorityModels: z.array(z.string()).optional(),
  cooldownSettings: z
    .object({
      rateLimitSeconds: z.number().int().min(5).max(86400).optional(),
      quotaExhaustedSeconds: z.number().int().min(60).max(604800).optional(),
      serverErrorSeconds: z.number().int().min(5).max(3600).optional(),
      timeoutSeconds: z.number().int().min(5).max(3600).optional(),
    })
    .optional(),
});

export type UpdateRoutingConfigInput = z.infer<typeof updateRoutingConfigSchema>;
