import uuid
from datetime import datetime
from typing import List
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    public_keys: Mapped[List["PublicKey"]] = relationship(
        "PublicKey", back_populates="user", cascade="all, delete-orphan"
    )
    document_anchors: Mapped[List["DocumentAnchor"]] = relationship(
        "DocumentAnchor", back_populates="user", cascade="all, delete-orphan"
    )
