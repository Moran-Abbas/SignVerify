/**
 * SignVerify Mobile – Document Types
 */

export interface QRPayload {
  signer_public_key_id: string;
  document_hash: string;
  digital_signature: string;
  timestamp: string;
  v_hash?: string;
  semantic_content?: any;
}

export interface DocumentMetadata {
  id: string;
  document_hash: string;
  user_id: string;
  created_at: string;
}

export interface VerificationResult {
  is_valid: boolean;
  statusText: string;
  timestamp?: string;
  signer_phone?: string;
}
