-- ==============================================================================
-- Astra AI — Phase 3 Database Schema Migration 002
-- Persistent Multi-Turn Conversations & Branching
-- ==============================================================================

-- 1. Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    response_mode VARCHAR(32) NOT NULL DEFAULT 'FULL_EXPLANATION',
    pinned_model_id VARCHAR(128),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(is_archived);

-- 2. Conversation Messages Table with Branching Support
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    response_mode VARCHAR(32) NOT NULL DEFAULT 'FULL_EXPLANATION',
    requested_model VARCHAR(128),
    actual_provider VARCHAR(64),
    actual_model VARCHAR(128),
    modality VARCHAR(16) NOT NULL DEFAULT 'text',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON conversation_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON conversation_messages(parent_message_id);
