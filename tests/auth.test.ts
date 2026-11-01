import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { sessionService } from '../src/auth/session-service.js';
import { sessionRepository } from '../src/database/repositories/session.repository.js';
import { env } from '../src/config/env.js';

describe('Backend Authentication System', () => {
  const testPassword = 'SuperSecretAstraPassword123!';
  const testDevice = {
    deviceId: 'win-dev-test-1',
    deviceName: 'Admin Windows Test Rig',
    clientType: 'windows',
    clientVersion: '0.2.0',
    ipAddress: '127.0.0.1',
  };

  beforeEach(async () => {
    sessionRepository.clearMemoryForTesting();
    // Configure hashed password in environment
    const hash = await hashPassword(testPassword);
    (env as any).ASTRA_PASSWORD_HASH = hash;
  });

  it('authenticates with valid password and creates session', async () => {
    const result = await sessionService.login(testPassword, testDevice);
    expect(result).toBeDefined();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    expect(result.deviceId).toBe(testDevice.deviceId);
  });

  it('rejects invalid password with generic error message', async () => {
    await expect(sessionService.login('wrong_password', testDevice)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('rotates refresh token on valid refresh request', async () => {
    const loginResult = await sessionService.login(testPassword, testDevice);
    const refreshResult = await sessionService.refresh(loginResult.refreshToken, testDevice);

    expect(refreshResult.accessToken).toBeTruthy();
    expect(refreshResult.refreshToken).toBeTruthy();
    expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken);
    expect(refreshResult.sessionId).toBe(loginResult.sessionId);
  });

  it('detects refresh token reuse and revokes entire session family', async () => {
    const loginResult = await sessionService.login(testPassword, testDevice);
    
    // First refresh succeeds and rotates the token
    const firstRefresh = await sessionService.refresh(loginResult.refreshToken, testDevice);
    expect(firstRefresh.refreshToken).toBeTruthy();

    // Replay attack: attempting to use the old refresh token again
    await expect(sessionService.refresh(loginResult.refreshToken, testDevice)).rejects.toThrow(
      'Session invalidated due to token reuse'
    );

    // Verify that the subsequent valid token from that family was ALSO revoked
    await expect(sessionService.refresh(firstRefresh.refreshToken, testDevice)).rejects.toThrow(
      'Session invalidated due to token reuse'
    );
  });

  it('logs out and revokes active session', async () => {
    const loginResult = await sessionService.login(testPassword, testDevice);
    await sessionService.logout(loginResult.refreshToken);

    // Refresh after logout fails
    await expect(sessionService.refresh(loginResult.refreshToken, testDevice)).rejects.toThrow();
  });

  it('lists active sessions and allows revocation by ID', async () => {
    const s1 = await sessionService.login(testPassword, { ...testDevice, deviceId: 'dev-1' });
    const s2 = await sessionService.login(testPassword, { ...testDevice, deviceId: 'dev-2' });

    let active = await sessionService.listActiveSessions();
    expect(active.length).toBe(2);

    const targetSession = active.find((s) => s.deviceId === 'dev-1');
    expect(targetSession).toBeDefined();

    await sessionService.revokeSessionById(targetSession!.id);

    active = await sessionService.listActiveSessions();
    expect(active.length).toBe(1);
    expect(active[0].deviceId).toBe('dev-2');
  });
});
