import { z } from 'zod';

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceName: z.string().min(1, 'Device name is required'),
  clientType: z.enum(['windows', 'chromeos', 'android', 'web', 'other']).default('windows'),
  clientVersion: z.string().default('0.2.0'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  clientType: z.string().optional(),
  clientVersion: z.string().optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
