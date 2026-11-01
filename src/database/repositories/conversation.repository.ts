import { v4 as uuidv4 } from 'uuid';
import { getDbPool } from '../connection.js';
import { env } from '../../config/env.js';

export interface ConversationRecord {
  id: string;
  title: string;
  sessionId?: string | null;
  responseMode: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
  pinnedModelId?: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  parentMessageId?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  responseMode: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
  requestedModel?: string | null;
  actualProvider?: string | null;
  actualModel?: string | null;
  modality: 'text' | 'vision';
  metadata: Record<string, any>;
  createdAt: Date;
}

// In-memory fallbacks when DATABASE_URL is not set (e.g. testing)
const memoryConversations = new Map<string, ConversationRecord>();
const memoryMessages = new Map<string, ConversationMessageRecord[]>();

export class ConversationRepository {
  private useMemory(): boolean {
    return !env.DATABASE_URL;
  }

  async createConversation(data: {
    id?: string;
    title?: string;
    sessionId?: string;
    responseMode?: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
    pinnedModelId?: string;
  }): Promise<ConversationRecord> {
    const record: ConversationRecord = {
      id: data.id || uuidv4(),
      title: data.title || 'New Conversation',
      sessionId: data.sessionId || null,
      responseMode: data.responseMode || 'FULL_EXPLANATION',
      pinnedModelId: data.pinnedModelId || null,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.useMemory()) {
      memoryConversations.set(record.id, record);
      memoryMessages.set(record.id, []);
      return record;
    }

    const pool = getDbPool();
    await pool.query(
      `INSERT INTO conversations (
        id, title, session_id, response_mode, pinned_model_id, is_archived, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.title,
        record.sessionId,
        record.responseMode,
        record.pinnedModelId,
        record.isArchived,
        record.createdAt,
        record.updatedAt,
      ]
    );

    return record;
  }

  async listConversations(options: {
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
    sessionId?: string;
  } = {}): Promise<{ items: ConversationRecord[]; total: number }> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const includeArchived = options.includeArchived ?? false;

    if (this.useMemory()) {
      let all = Array.from(memoryConversations.values());
      if (!includeArchived) {
        all = all.filter((c) => !c.isArchived);
      }
      if (options.sessionId) {
        all = all.filter((c) => c.sessionId === options.sessionId);
      }
      all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const total = all.length;
      const items = all.slice(offset, offset + limit);
      return { items, total };
    }

    const pool = getDbPool();
    const conditions: string[] = [];
    const params: any[] = [];

    if (!includeArchived) {
      conditions.push('is_archived = false');
    }
    if (options.sessionId) {
      params.push(options.sessionId);
      conditions.push(`session_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM conversations ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listRes = await pool.query(
      `SELECT
        id, title, session_id AS "sessionId", response_mode AS "responseMode",
        pinned_model_id AS "pinnedModelId", is_archived AS "isArchived",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM conversations
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return { items: listRes.rows, total };
  }

  async getConversation(id: string, sessionId?: string): Promise<ConversationRecord | null> {
    if (this.useMemory()) {
      const conv = memoryConversations.get(id);
      if (!conv) return null;
      if (sessionId && conv.sessionId && conv.sessionId !== sessionId) {
        return null;
      }
      return conv;
    }

    const pool = getDbPool();
    let query = `SELECT
        id, title, session_id AS "sessionId", response_mode AS "responseMode",
        pinned_model_id AS "pinnedModelId", is_archived AS "isArchived",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM conversations
      WHERE id = $1`;
    const params: any[] = [id];
    if (sessionId) {
      params.push(sessionId);
      query += ` AND session_id = $2`;
    }
    const res = await pool.query(query, params);

    return res.rows[0] || null;
  }

  async updateConversation(
    id: string,
    updates: {
      title?: string;
      isArchived?: boolean;
      responseMode?: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
      pinnedModelId?: string | null;
    },
    sessionId?: string
  ): Promise<ConversationRecord | null> {
    if (this.useMemory()) {
      const existing = memoryConversations.get(id);
      if (!existing) return null;
      if (sessionId && existing.sessionId && existing.sessionId !== sessionId) {
        return null;
      }
      if (updates.title !== undefined) existing.title = updates.title;
      if (updates.isArchived !== undefined) existing.isArchived = updates.isArchived;
      if (updates.responseMode !== undefined) existing.responseMode = updates.responseMode;
      if (updates.pinnedModelId !== undefined) existing.pinnedModelId = updates.pinnedModelId;
      existing.updatedAt = new Date();
      return existing;
    }

    const pool = getDbPool();
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];

    if (updates.title !== undefined) {
      params.push(updates.title);
      sets.push(`title = $${params.length}`);
    }
    if (updates.isArchived !== undefined) {
      params.push(updates.isArchived);
      sets.push(`is_archived = $${params.length}`);
    }
    if (updates.responseMode !== undefined) {
      params.push(updates.responseMode);
      sets.push(`response_mode = $${params.length}`);
    }
    if (updates.pinnedModelId !== undefined) {
      params.push(updates.pinnedModelId);
      sets.push(`pinned_model_id = $${params.length}`);
    }

    let whereClause = `WHERE id = $1`;
    if (sessionId) {
      params.push(sessionId);
      whereClause += ` AND session_id = $${params.length}`;
    }

    const res = await pool.query(
      `UPDATE conversations
      SET ${sets.join(', ')}
      ${whereClause}
      RETURNING
        id, title, session_id AS "sessionId", response_mode AS "responseMode",
        pinned_model_id AS "pinnedModelId", is_archived AS "isArchived",
        created_at AS "createdAt", updated_at AS "updatedAt"`,
      params
    );

    return res.rows[0] || null;
  }

  async deleteConversation(id: string, sessionId?: string): Promise<boolean> {
    if (this.useMemory()) {
      const existing = memoryConversations.get(id);
      if (!existing) return false;
      if (sessionId && existing.sessionId && existing.sessionId !== sessionId) {
        return false;
      }
      const existed = memoryConversations.delete(id);
      memoryMessages.delete(id);
      return existed;
    }

    const pool = getDbPool();
    const query = sessionId
      ? 'DELETE FROM conversations WHERE id = $1 AND session_id = $2'
      : 'DELETE FROM conversations WHERE id = $1';
    const params = sessionId ? [id, sessionId] : [id];
    const res = await pool.query(query, params);
    return (res.rowCount ?? 0) > 0;
  }

  async addMessage(
    data: {
      id?: string;
      conversationId: string;
      parentMessageId?: string | null;
      role: 'user' | 'assistant' | 'system';
      content: string;
      responseMode?: 'FULL_EXPLANATION' | 'ANSWER_ONLY';
      requestedModel?: string | null;
      actualProvider?: string | null;
      actualModel?: string | null;
      modality?: 'text' | 'vision';
      metadata?: Record<string, any>;
    },
    sessionId?: string
  ): Promise<ConversationMessageRecord> {
    if (sessionId) {
      const conv = await this.getConversation(data.conversationId, sessionId);
      if (!conv) {
        throw new Error(`Conversation not found or unauthorized: ${data.conversationId}`);
      }
    }
    const record: ConversationMessageRecord = {
      id: data.id || uuidv4(),
      conversationId: data.conversationId,
      parentMessageId: data.parentMessageId || null,
      role: data.role,
      content: data.content,
      responseMode: data.responseMode || 'FULL_EXPLANATION',
      requestedModel: data.requestedModel || null,
      actualProvider: data.actualProvider || null,
      actualModel: data.actualModel || null,
      modality: data.modality || 'text',
      metadata: data.metadata || {},
      createdAt: new Date(),
    };

    if (this.useMemory()) {
      const messages = memoryMessages.get(data.conversationId) || [];
      messages.push(record);
      memoryMessages.set(data.conversationId, messages);

      const conv = memoryConversations.get(data.conversationId);
      if (conv) {
        conv.updatedAt = record.createdAt;
      }
      return record;
    }

    const pool = getDbPool();
    await pool.query(
      `INSERT INTO conversation_messages (
        id, conversation_id, parent_message_id, role, content,
        response_mode, requested_model, actual_provider, actual_model,
        modality, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.id,
        record.conversationId,
        record.parentMessageId,
        record.role,
        record.content,
        record.responseMode,
        record.requestedModel,
        record.actualProvider,
        record.actualModel,
        record.modality,
        JSON.stringify(record.metadata),
        record.createdAt,
      ]
    );

    // Update conversation timestamp
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [record.conversationId]
    );

    return record;
  }

  async getMessages(conversationId: string, sessionId?: string): Promise<ConversationMessageRecord[]> {
    if (sessionId) {
      const conv = await this.getConversation(conversationId, sessionId);
      if (!conv) {
        return [];
      }
    }

    if (this.useMemory()) {
      return memoryMessages.get(conversationId) || [];
    }

    const pool = getDbPool();
    const res = await pool.query(
      `SELECT
        id, conversation_id AS "conversationId", parent_message_id AS "parentMessageId",
        role, content, response_mode AS "responseMode",
        requested_model AS "requestedModel", actual_provider AS "actualProvider",
        actual_model AS "actualModel", modality, metadata,
        created_at AS "createdAt"
      FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
      [conversationId]
    );

    return res.rows;
  }

  async branchConversation(
    sourceConversationId: string,
    fromMessageId: string,
    newTitle?: string,
    sessionId?: string
  ): Promise<{ conversation: ConversationRecord; messages: ConversationMessageRecord[] }> {
    const sourceConv = await this.getConversation(sourceConversationId, sessionId);
    if (!sourceConv) {
      throw new Error(`Source conversation ${sourceConversationId} not found`);
    }

    const allMessages = await this.getMessages(sourceConversationId, sessionId);
    const targetIdx = allMessages.findIndex((m) => m.id === fromMessageId);
    if (targetIdx === -1) {
      throw new Error(`Message ${fromMessageId} not found in conversation ${sourceConversationId}`);
    }

    // Messages up to and including fromMessageId form the base branch
    const branchMessages = allMessages.slice(0, targetIdx + 1);

    const newConv = await this.createConversation({
      title: newTitle || `${sourceConv.title} (Branch)`,
      sessionId: sourceConv.sessionId || sessionId || undefined,
      responseMode: sourceConv.responseMode,
      pinnedModelId: sourceConv.pinnedModelId || undefined,
    });

    const copiedMessages: ConversationMessageRecord[] = [];
    let previousNewId: string | null = null;

    for (const msg of branchMessages) {
      const copied = await this.addMessage({
        conversationId: newConv.id,
        parentMessageId: previousNewId,
        role: msg.role,
        content: msg.content,
        responseMode: msg.responseMode,
        requestedModel: msg.requestedModel,
        actualProvider: msg.actualProvider,
        actualModel: msg.actualModel,
        modality: msg.modality,
        metadata: msg.metadata,
      });
      copiedMessages.push(copied);
      previousNewId = copied.id;
    }

    return { conversation: newConv, messages: copiedMessages };
  }
}

export const conversationRepository = new ConversationRepository();
