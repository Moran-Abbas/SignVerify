from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    phone_number: str = Field(..., description="E.164 formatted phone number")


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    public_key: str = Field(..., description="PEM-encoded ECDSA secp256r1 public key")


class UserResponse(UserBase):
    id: UUID
    public_key: Optional[str] = None
    is_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicKeyResponse(BaseModel):
    public_key: str
