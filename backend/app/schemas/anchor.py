from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class SemanticContent(BaseModel):
    amount: float
    currency: str
    date: str
    parties: List[str]

class AnchorCreateRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded string of the normalized image")
    digital_signature: str = Field(..., description="Base64 encoded signature from hardware enclave")
    binding_vhash: Optional[str] = Field(None, description="64-bit Perceptual Hash (v_hash)")
    semantic_content: Optional[SemanticContent] = Field(None, description="LLM-extracted 'Truth' JSON")
    payload_json: str = Field(..., description="The raw JSON string that was signed")
    transaction_uuid: str = Field(..., description="Unique nonce for replay protection")
    # 2026 QR-less Spec
    phash: Optional[str] = Field(None, description="64-bit pHash (Visual ID)")
    reference_id: Optional[str] = Field(None, description="6-digit alphanumeric Shortcode")

class AnchorPayload(BaseModel):
    document_hash: str
    digital_signature: str
    signer_public_key_id: str
    binding_vhash: Optional[str] = None
    semantic_content: Optional[SemanticContent] = None

class AnchorResponse(BaseModel):
    id: str
    s3_uri: str
    file_hash: str
    created_at: datetime
    reference_id: Optional[str] = None
    payload: AnchorPayload
