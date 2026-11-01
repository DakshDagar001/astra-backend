import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { generateAccessToken } from '../src/auth/tokens.js';
import { getSystemInstructionForMode } from '../src/utils/response-mode.js';
import { conversationRepository } from '../src/database/repositories/conversation.repository.js';
import { providerRegistry } from '../src/providers/registry/provider.registry.js';
import { routingRepository } from '../src/database/repositories/routing.repository.js';
import { healthRepository } from '../src/database/repositories/health.repository.js';
import { env } from '../src/config/env.js';
import { AIExecuteRequest, AIExecuteResponse } from '../src/providers/interfaces/provider.interface.js';

describe('Response Mode System', () => {
  it('returns proper instructions for FULL_EXPLANATION', () => {
    const inst = getSystemInstructionForMode('FULL_EXPLANATION');
    expect(inst).toContain('FULL EXPLANATION mode');
    expect(inst).toContain('step-by-step');
    expect(inst).toContain('formulas');
  });

  it('returns proper instructions for ANSWER_ONLY', () => {
    const inst = getSystemInstructionForMode('ANSWER_ONLY');
    expect(inst).toContain('ANSWER ONLY mode');
    expect(inst).toContain('concise final answer');
    expect(inst).toContain('Do NOT provide step-by-step explanations');
  });

  it('defaults to FULL_EXPLANATION when undefined', () => {
    const inst = getSystemInstructionForMode(undefined);
    expect(inst).toContain('FULL EXPLANATION mode');
  });
});

describe('Persistent Multi-Turn Conversations API', () => {
  const app = createApp();
  let authToken: string;

  beforeEach(() => {
    authToken = generateAccessToken({
      sub: 'owner',
      sessionId: 'test-session-conv',
      clientType: 'windows',
      deviceId: 'test-device-conv',
    });
  });

  it('creates, retrieves, updates, and deletes a conversation', async () => {
    // 1. Create
    const createRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Physics Homework',
        responseMode: 'FULL_EXPLANATION',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.title).toBe('Physics Homework');
    expect(createRes.body.data.responseMode).toBe('FULL_EXPLANATION');
    const convId = createRes.body.data.id;

    // 2. Get Details
    const getRes = await request(app)
      .get(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(convId);

    // 3. Add message
    const msgRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        role: 'user',
        content: 'What is acceleration?',
        responseMode: 'FULL_EXPLANATION',
      });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.data.content).toBe('What is acceleration?');
    const userMsgId = msgRes.body.data.id;

    // 4. Add assistant response
    const replyRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        role: 'assistant',
        content: 'Acceleration is the rate of change of velocity.',
        parentMessageId: userMsgId,
        actualProvider: 'openai',
        actualModel: 'openai:gpt-4o-mini',
      });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.data.parentMessageId).toBe(userMsgId);

    // 5. Get Messages
    const listMsgsRes = await request(app)
      .get(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(listMsgsRes.status).toBe(200);
    expect(listMsgsRes.body.data.length).toBe(2);

    // 6. Branch conversation
    const branchRes = await request(app)
      .post(`/api/v1/conversations/${convId}/branch`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fromMessageId: userMsgId,
        title: 'Branched Physics Conversation',
      });

    expect(branchRes.status).toBe(201);
    expect(branchRes.body.data.conversation.title).toBe('Branched Physics Conversation');
    expect(branchRes.body.data.messages.length).toBe(1);

    // 7. Update conversation
    const updateRes = await request(app)
      .patch(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Archived Physics Conversation',
        isArchived: true,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBe('Archived Physics Conversation');
    expect(updateRes.body.data.isArchived).toBe(true);

    // 8. Delete conversation
    const delRes = await request(app)
      .delete(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(delRes.status).toBe(200);

    // 9. Confirm deletion
    const getDeleted = await request(app)
      .get(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getDeleted.status).toBe(404);
  });

  it('enforces multi-session isolation preventing unauthorized access', async () => {
    const sessionAToken = generateAccessToken({
      sub: 'owner',
      sessionId: 'session-alpha',
      clientType: 'windows',
      deviceId: 'device-alpha',
    });

    const sessionBToken = generateAccessToken({
      sub: 'owner',
      sessionId: 'session-beta',
      clientType: 'chromeos',
      deviceId: 'device-beta',
    });

    // Session A creates a conversation
    const createRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${sessionAToken}`)
      .send({
        title: 'Session Alpha Private Chat',
        responseMode: 'ANSWER_ONLY',
      });

    expect(createRes.status).toBe(201);
    const convId = createRes.body.data.id;

    // Session B tries to list conversations -> must not see Session A's conversation
    const listRes = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${sessionBToken}`);
    expect(listRes.status).toBe(200);
    const foundInB = listRes.body.data.items.some((c: any) => c.id === convId);
    expect(foundInB).toBe(false);

    // Session B tries to get details -> 404
    const getRes = await request(app)
      .get(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${sessionBToken}`);
    expect(getRes.status).toBe(404);

    // Session B tries to update conversation -> 404
    const updateRes = await request(app)
      .patch(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${sessionBToken}`)
      .send({ title: 'Hijacked Title' });
    expect(updateRes.status).toBe(404);

    // Session B tries to add message -> 404
    const addMsgRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${sessionBToken}`)
      .send({ role: 'user', content: 'Unauthorized injection' });
    expect(addMsgRes.status).toBe(404);

    // Session B tries to delete conversation -> 404
    const delRes = await request(app)
      .delete(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${sessionBToken}`);
    expect(delRes.status).toBe(404);

    // Session A can still access their conversation
    const getAlphaRes = await request(app)
      .get(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${sessionAToken}`);
    expect(getAlphaRes.status).toBe(200);
    expect(getAlphaRes.body.data.title).toBe('Session Alpha Private Chat');
  });
});

describe('Real-Time SSE Streaming Endpoint', () => {
  const app = createApp();
  let authToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    (env as any).OPENAI_API_KEY = 'mock-key-openai';

    await routingRepository.updateConfig({
      mode: 'automatic',
      pinnedModelId: null,
      fallbackEnabled: true,
      maxAttempts: 3,
      textPriorityModels: ['openai:gpt-4o-mini', 'gemini:gemini-2.5-flash'],
      visionPriorityModels: ['openai:gpt-4o-mini'],
    });

    const records = await healthRepository.getAllRecords();
    for (const r of records) {
      await healthRepository.setRecord({
        ...r,
        status: 'AVAILABLE',
        cooldownUntil: null,
        failureCount: 0,
      });
    }

    authToken = generateAccessToken({
      sub: 'owner',
      sessionId: 'test-session-stream',
      clientType: 'windows',
      deviceId: 'test-device-stream',
    });
  });

  it('streams response chunks via SSE on POST /api/v1/ai/chat/stream', async () => {
    // Mock the openai provider adapter streaming
    const openai = providerRegistry.getProvider('openai');
    if (openai) {
      vi.spyOn(openai, 'executeStreamingRequest').mockImplementation(
        async (req: AIExecuteRequest, onChunk: (c: string) => void): Promise<AIExecuteResponse> => {
          onChunk('Hello');
          onChunk(' world');
          return {
            text: 'Hello world',
            model: req.modelIdentifier,
            usage: { totalTokens: 10 },
          };
        }
      );
    }

    const res = await request(app)
      .post('/api/v1/ai/chat/stream')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        prompt: 'Say hello world',
        modelId: 'openai:gpt-4o-mini',
        responseMode: 'ANSWER_ONLY',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: start');
    expect(res.text).toContain('event: metadata');
    expect(res.text).toContain('event: token');
    expect(res.text).toContain('event: complete');
    expect(res.text).toContain('Hello');
    expect(res.text).toContain('world');
  });
});
