import { z } from 'zod';

export const chatRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  modelId: z.string().optional(),
  responseMode: z.enum(['FULL_EXPLANATION', 'ANSWER_ONLY']).optional(),
  images: z
    .array(
      z.object({
        mimeType: z.string().min(1),
        dataBase64: z.string().min(1),
      })
    )
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
});

export const testConnectionSchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
