-- ==============================================================================
-- Astra AI — Phase 2 Database Schema Migration 001
-- PostgreSQL 14+ compatible
-- ==============================================================================

-- 1. Refresh Sessions & Token Rotation
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    client_type VARCHAR(32) NOT NULL,
    client_version VARCHAR(32) NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(128),
    replaced_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_revoked ON sessions(expires_at, revoked_at);

-- 2. User / System Routing Configurations
CREATE TABLE IF NOT EXISTS routing_configurations (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
    mode VARCHAR(32) NOT NULL DEFAULT 'automatic',
    pinned_model_id VARCHAR(128),
    fallback_enabled BOOLEAN NOT NULL DEFAULT true,
    max_attempts INT NOT NULL DEFAULT 3,
    text_priority_models JSONB NOT NULL DEFAULT '[]'::jsonb,
    vision_priority_models JSONB NOT NULL DEFAULT '[]'::jsonb,
    cooldown_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default routing configuration if not exists
INSERT INTO routing_configurations (id, mode, fallback_enabled, max_attempts, text_priority_models, vision_priority_models, cooldown_settings)
VALUES (
    'default',
    'automatic',
    true,
    3,
    '["openai:gpt-4o-mini", "gemini:gemini-2.5-flash", "groq:llama-3.3-70b", "openrouter:auto", "together:llama-3.3-70b-instruct", "deepinfra:llama-3.3-70b-instruct", "nvidia:meta-llama-3.1-70b-instruct", "huggingface:qwen2.5-72b-instruct"]'::jsonb,
    '["gemini:gemini-2.5-flash", "openai:gpt-4o-mini", "openrouter:auto", "groq:llama-3.2-11b-vision", "together:llama-3.2-11b-vision-instruct", "deepinfra:llama-3.2-11b-vision-instruct", "nvidia:meta-llama-3.2-11b-vision-instruct"]'::jsonb,
    '{"rateLimitSeconds": 60, "quotaExhaustedSeconds": 3600, "serverErrorSeconds": 30, "timeoutSeconds": 15}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 3. Provider Health & Cooldown Tracking
CREATE TABLE IF NOT EXISTS provider_health_records (
    id VARCHAR(128) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL,
    model_id VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    cooldown_until TIMESTAMPTZ,
    error_category VARCHAR(64),
    last_error_message TEXT,
    failure_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_provider ON provider_health_records(provider_id);
CREATE INDEX IF NOT EXISTS idx_health_cooldown ON provider_health_records(cooldown_until);

-- 4. Request Metadata & Audit Logging
CREATE TABLE IF NOT EXISTS request_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    correlation_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64),
    client_type VARCHAR(32),
    requested_model VARCHAR(128) NOT NULL,
    actual_provider VARCHAR(64),
    actual_model VARCHAR(128),
    modality VARCHAR(16) NOT NULL DEFAULT 'text',
    fallback_occurred BOOLEAN NOT NULL DEFAULT false,
    attempts_count INT NOT NULL DEFAULT 1,
    latency_ms INT NOT NULL DEFAULT 0,
    status_code INT NOT NULL DEFAULT 200,
    error_category VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_correlation ON request_audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON request_audit_logs(created_at);
