import { Router, Request, Response, NextFunction } from 'express';
import { verifyAuthPassword } from '../auth/simple-auth.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { loginRateLimiter } from '../middleware/rate-limit.middleware.js';
import { AuthenticationError } from '../utils/errors.js';

const router = Router();

// POST /api/v1/auth/login
router.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidate = req.body?.password || (req.headers['x-astra-password'] as string);

      if (!candidate || !verifyAuthPassword(candidate)) {
        throw new AuthenticationError('Invalid authentication credentials');
      }

      res.status(200).json({
        success: true,
        data: {
          authenticated: true,
          token: candidate,
          accessToken: candidate,
          refreshToken: candidate,
          sessionId: 'default-session',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidate = req.body?.refreshToken || (req.headers['x-astra-password'] as string);

      if (!candidate || !verifyAuthPassword(candidate)) {
        throw new AuthenticationError('Invalid refresh credentials');
      }

      res.status(200).json({
        success: true,
        data: {
          authenticated: true,
          token: candidate,
          accessToken: candidate,
          refreshToken: candidate,
          sessionId: 'default-session',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/v1/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      authenticated: true,
      user: req.user?.sub || 'owner',
      role: req.user?.role || 'owner',
      deviceId: req.user?.deviceId || 'device-test-api',
      sessionId: req.user?.sessionId || 'default-session',
    },
  });
});

export const authRoutes = router;
