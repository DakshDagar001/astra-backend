import { Router, Request, Response, NextFunction } from 'express';
import { sessionService } from '../auth/session-service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { loginRateLimiter } from '../middleware/rate-limit.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema, refreshSchema, logoutSchema } from '../validators/auth.validator.js';

const router = Router();

// POST /api/v1/auth/login
router.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password, deviceId, deviceName, clientType, clientVersion } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await sessionService.login(password, {
        deviceId,
        deviceName,
        clientType,
        clientVersion,
        ipAddress: ip,
        userAgent,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken, deviceId, deviceName, clientType, clientVersion } = req.body;
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await sessionService.refresh(refreshToken, {
        deviceId,
        deviceName,
        clientType,
        clientVersion,
        ipAddress: ip,
        userAgent,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  validateBody(logoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      await sessionService.logout(refreshToken);
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/auth/me
router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          user: req.user?.sub,
          sessionId: req.user?.sessionId,
          deviceId: req.user?.deviceId,
          clientType: req.user?.clientType,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/auth/sessions
router.get(
  '/sessions',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessions = await sessionService.listActiveSessions();
      res.status(200).json({
        success: true,
        data: {
          sessions,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/auth/sessions/:id
router.delete(
  '/sessions/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await sessionService.revokeSessionById(id);
      res.status(200).json({
        success: true,
        message: 'Session revoked',
      });
    } catch (err) {
      next(err);
    }
  }
);

export const authRoutes = router;
