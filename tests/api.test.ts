import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { env } from '../src/config/env.js';
import { sessionRepository } from '../src/database/repositories/session.repository.js';
import { providerRegistry } from '../src/providers/registry/provider.registry.js';
import { resetRateLimitsForTesting } from '../src/middleware/rate-limit.middleware.js';

describe('Astra AI Backend API Endpoints', () => {
  const app = createApp();
  const testPassword = 'TestPassword123!';
  let accessToken: string;
  let refreshToken: string;

  beforeEach(async () => {
    sessionRepository.clearMemoryForTesting();
    resetRateLimitsForTesting();
    (env as any).AUTH_PASSWORD = testPassword;
    (env as any).OPENAI_API_KEY = 'mock-openai-key';

    // Login to get tokens
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        password: testPassword,
        deviceId: 'device-test-api',
        deviceName: 'Vitest Runner',
        clientType: 'windows',
        clientVersion: '0.2.0',
      });

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('GET /health returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.uptimeSeconds).toBeDefined();
  });

  it('POST /api/v1/auth/login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        password: testPassword,
        deviceId: 'device-test-2',
        deviceName: 'Device 2',
        clientType: 'chromeos',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('GET /api/v1/auth/me returns current authenticated session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBe('owner');
    expect(res.body.data.deviceId).toBe('device-test-api');
  });

  it('GET /api/v1/providers lists all providers without exposing secrets', async () => {
    const res = await request(app)
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providers.length).toBe(8);

    const openai = res.body.data.providers.find((p: any) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai.isConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('mock-openai-key');
  });

  it('GET /api/v1/models lists models with capability tags', async () => {
    const res = await request(app)
      .get('/api/v1/models')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.models.length).toBeGreaterThan(0);
  });

  it('GET and PUT /api/v1/routing/config manages routing preferences', async () => {
    const getRes = await request(app)
      .get('/api/v1/routing/config')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.config.maxAttempts).toBeDefined();

    const putRes = await request(app)
      .put('/api/v1/routing/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'manual',
        pinnedModelId: 'openai:gpt-4o-mini',
        fallbackEnabled: false,
        maxAttempts: 2,
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.config.mode).toBe('manual');
    expect(putRes.body.data.config.pinnedModelId).toBe('openai:gpt-4o-mini');
  });

  it('POST /api/v1/ai/chat executes AI request via AIRE', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    vi.spyOn(openai, 'executeRequest').mockResolvedValueOnce({
      text: 'Response from AIRE API test',
      model: 'gpt-4o-mini',
    });

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        prompt: 'Say hello',
        modelId: 'openai:gpt-4o-mini',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe('Response from AIRE API test');
    expect(res.body.data.metadata.actualProvider).toBe('openai');
    expect(res.body.data.metadata.actualModel).toBe('openai:gpt-4o-mini');
  });

  it('POST /api/v1/ai/test-connection tests provider connectivity', async () => {
    const openai = providerRegistry.getProvider('openai')!;
    vi.spyOn(openai, 'executeRequest').mockResolvedValueOnce({
      text: 'OK',
      model: 'gpt-4o-mini',
    });

    const res = await request(app)
      .post('/api/v1/ai/test-connection')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        providerId: 'openai',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONNECTED');
  });
});
