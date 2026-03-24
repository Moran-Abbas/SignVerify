from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class SigningLogCreate(BaseModel):
    """
    Payload sent from the mobile app after successfully 
    signing a Document_Hash with the hardware Private Key.
    """
    document_hash: str = Field(..., description="SHA-256 hash of the extracted document text.")
    digital_signature: str = Field(..., description="Base64 encoded ECDSA signature over the document_hash.")
    signer_public_key_id: str = Field(..., description="Identifier for the public key used to sign the hash.")

class SigningLogResponse(BaseModel):
    """
    Response model for a saved signing log.
    """
    id: str
    user_id: str
    document_hash: str
    digital_signature: str
    signer_public_key_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
