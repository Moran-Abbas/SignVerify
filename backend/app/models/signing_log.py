from sqlalchemy import Column, String, ForeignKey, DateTime, Text, Uuid
from sqlalchemy.orm import relationship
import uuid
import datetime
from app.database import Base

class SigningLog(Base):
    """
    SQLAlchemy model for tracking document signing events. 
    Stores metadata only (no pure document images or plain text).
    """
    __tablename__ = "signing_logs"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_hash = Column(String(64), nullable=False, index=True)
    digital_signature = Column(Text, nullable=False)
    signer_public_key_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    signed_at = Column(DateTime(timezone=True), default=datetime.datetime.utcnow)

    # Relationship back to the user
    user = relationship("User", foreign_keys=[user_id], backref="signing_logs")
