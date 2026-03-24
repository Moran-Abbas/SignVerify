-- ═══════════════════════════════════════════════════════════════
-- SignVerify – PostgreSQL Database Schema
-- Required by SKILL.md: "Provide the complete database schema
-- required for the PostgreSQL backend."
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number    VARCHAR(20) NOT NULL UNIQUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users (phone_number);

-- ── Public Keys ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key_pem  TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_public_keys_user ON public_keys (user_id);

-- ── Document Anchors ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_anchors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    s3_uri          TEXT NOT NULL,
    file_hash       VARCHAR(64) NOT NULL,
    digital_signature TEXT NOT NULL,
    -- Forensic & Re-verification (2026 Spec)
    signed_payload_json TEXT, -- Raw JSON commitment string
    binding_vhash    VARCHAR(16),
    normalized_content JSONB,
    transaction_uuid VARCHAR(36) UNIQUE,
    signer_public_key_id UUID NOT NULL REFERENCES public_keys(id),
    idempotency_key VARCHAR(128) UNIQUE,
    
    -- Visual Search (QR-less)
    phash           VARCHAR(64),
    reference_id    VARCHAR(6) UNIQUE,
    orb_descriptors JSONB,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_anchors_user ON document_anchors (user_id);
CREATE INDEX idx_document_anchors_hash ON document_anchors (file_hash);
CREATE INDEX idx_document_anchors_phash ON document_anchors (phash);
CREATE INDEX idx_document_anchors_ref ON document_anchors (reference_id);

-- ── Forensic Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forensic_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) DEFAULT 'HIGH',
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    anchor_id       UUID REFERENCES document_anchors(id) ON DELETE SET NULL,
    details         JSONB,
    client_ip       VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
