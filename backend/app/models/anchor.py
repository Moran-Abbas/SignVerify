import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base

class DocumentAnchor(Base):
    __tablename__ = "document_anchors"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    s3_uri: Mapped[str] = mapped_column(Text, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    digital_signature: Mapped[str] = mapped_column(Text, nullable=False)
    # Exact UTF-8 JSON string that was signed (enables post-hoc ECDSA verification on verify flow)
    signed_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    binding_vhash: Mapped[str | None] = mapped_column(String(16), nullable=True)
    normalized_content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    transaction_uuid: Mapped[uuid.UUID] = mapped_column(String(36), unique=True, index=True, nullable=False)
    signer_public_key_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public_keys.id"), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    
    # Visual-Search-First (2026 QR-less Spec)
    phash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(6), unique=True, index=True, nullable=True)
    orb_descriptors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user = relationship("User", back_populates="document_anchors")
    signer_key = relationship("PublicKey")

class ForensicLog(Base):
    __tablename__ = "forensic_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True) # e.g., "TAMPER_ALERT", "REPLAY_ATTACK"
    severity: Mapped[str] = mapped_column(String(20), default="HIGH")
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    anchor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("document_anchors.id", ondelete="SET NULL"), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    client_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
