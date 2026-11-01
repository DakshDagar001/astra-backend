import { z } from 'zod';

export const createConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  responseMode: z.enum(['FULL_EXPLANATION', 'ANSWER_ONLY']).optional(),
  pinnedModelId: z.string().optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  isArchived: z.boolean().optional(),
  responseMode: z.enum(['FULL_EXPLANATION', 'ANSWER_ONLY']).optional(),
  pinnedModelId: z.string().nullable().optional(),
});

export const addMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty'),
  parentMessageId: z.string().optional(),
  responseMode: z.enum(['FULL_EXPLANATION', 'ANSWER_ONLY']).optional(),
  requestedModel: z.string().optional(),
  actualProvider: z.string().optional(),
  actualModel: z.string().optional(),
  modality: z.enum(['text', 'vision']).optional(),
  metadata: z.record(z.any()).optional(),
});

export const branchConversationSchema = z.object({
  fromMessageId: z.string().min(1, 'fromMessageId is required'),
  title: z.string().min(1).max(255).optional(),
});
