import { Router, Request, Response, NextFunction } from 'express';
import { conversationRepository } from '../database/repositories/conversation.repository.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  createConversationSchema,
  updateConversationSchema,
  addMessageSchema,
  branchConversationSchema,
} from '../validators/conversation.validator.js';
import { AppError } from '../utils/errors.js';

const router = Router();

// All conversation routes require authentication
router.use(requireAuth);

// GET /api/v1/conversations — list conversations
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const includeArchived = req.query.includeArchived === 'true';

    const result = await conversationRepository.listConversations({
      limit,
      offset,
      includeArchived,
      sessionId: req.user?.sessionId,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/conversations — create conversation
router.post(
  '/',
  validateBody(createConversationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, responseMode, pinnedModelId } = req.body;
      const conversation = await conversationRepository.createConversation({
        title,
        responseMode,
        pinnedModelId,
        sessionId: req.user?.sessionId,
      });

      res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/conversations/:id — get conversation details
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversation = await conversationRepository.getConversation(req.params.id, req.user?.sessionId);
    if (!conversation) {
      throw new AppError('Conversation not found', 'INVALID_REQUEST', 404);
    }

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/conversations/:id — update conversation
router.patch(
  '/:id',
  validateBody(updateConversationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await conversationRepository.updateConversation(
        req.params.id,
        req.body,
        req.user?.sessionId
      );
      if (!updated) {
        throw new AppError('Conversation not found', 'INVALID_REQUEST', 404);
      }

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/conversations/:id — delete conversation
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deleted = await conversationRepository.deleteConversation(req.params.id, req.user?.sessionId);
    if (!deleted) {
      throw new AppError('Conversation not found', 'INVALID_REQUEST', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/conversations/:id/messages — get message history
router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversation = await conversationRepository.getConversation(req.params.id, req.user?.sessionId);
    if (!conversation) {
      throw new AppError('Conversation not found', 'INVALID_REQUEST', 404);
    }

    const messages = await conversationRepository.getMessages(req.params.id, req.user?.sessionId);
    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/conversations/:id/messages — append message
router.post(
  '/:id/messages',
  validateBody(addMessageSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversation = await conversationRepository.getConversation(req.params.id, req.user?.sessionId);
      if (!conversation) {
        throw new AppError('Conversation not found', 'INVALID_REQUEST', 404);
      }

      const message = await conversationRepository.addMessage(
        {
          conversationId: req.params.id,
          ...req.body,
        },
        req.user?.sessionId
      );

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/conversations/:id/branch — branch conversation
router.post(
  '/:id/branch',
  validateBody(branchConversationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fromMessageId, title } = req.body;
      const result = await conversationRepository.branchConversation(
        req.params.id,
        fromMessageId,
        title,
        req.user?.sessionId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

export default router;
