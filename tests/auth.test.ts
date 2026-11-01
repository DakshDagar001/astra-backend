import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { verifyAuthPassword } from '../src/auth/simple-auth.js';
import { sessionService } from '../src/auth/session-service.js';
import { resetRateLimitsForTesting } from '../src/middleware/rate-limit.middleware.js';

describe('Simplified Single-User Authentication System (AUTH_PASSWORD)', () => {
  const app = createApp();
  const testPassword = 'SuperSecretAstraPassword123!';
  const testDevice = {
    deviceId: 'win-dev-test-1',
    deviceName: 'Admin Windows Test Rig',
    clientType: 'windows',
    clientVersion: '0.2.0',
    ipAddress: '127.0.0.1',
  };

  beforeEach(() => {
    resetRateLimitsForTesting();
    (env as any).AUTH_PASSWORD = testPassword;
  });

  it('verifies valid password using constant-time comparison', () => {
    expect(verifyAuthPassword(testPassword)).toBe(true);
  });

  it('rejects invalid password, empty string, or undefined', () => {
    expect(verifyAuthPassword('wrong-password')).toBe(false);
    expect(verifyAuthPassword('')).toBe(false);
    expect(verifyAuthPassword(undefined)).toBe(false);
  });

  it('authenticates with valid password and returns session tokens via service', async () => {
    const result = await sessionService.login(testPassword, testDevice);
    expect(result).toBeDefined();
    expect(result.accessToken).toBe(testPassword);
    expect(result.refreshToken).toBe(testPassword);
    expect(result.sessionId).toBeTruthy();
    expect(result.deviceId).toBe(testDevice.deviceId);
  });

  it('rejects invalid password with generic error message via service', async () => {
    await expect(sessionService.login('wrong_password', testDevice)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('allows access via X-Astra-Password header on protected endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/models')
      .set('X-Astra-Password', testPassword);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows access via Authorization: Bearer <password> header', async () => {
    const res = await request(app)
      .get('/api/v1/models')
      .set('Authorization', `Bearer ${testPassword}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('blocks access to protected endpoints with 401 when password is wrong or missing', async () => {
    const resNoAuth = await request(app).get('/api/v1/models');
    expect(resNoAuth.status).toBe(401);

    const resBadAuth = await request(app)
      .get('/api/v1/models')
      .set('X-Astra-Password', 'invalid-pass');
    expect(resBadAuth.status).toBe(401);
  });

  it('logs out cleanly and reports success', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
