import { apiClient } from './apiClient';
import { Endpoints } from '../config/api';
import { v4 as uuidv4 } from 'uuid';

export interface AnchorPayload {
  document_hash: string;
  digital_signature: string;
  signer_public_key_id: string;
  binding_vhash?: string;
  semantic_content?: any;
}

export interface AnchorResponse {
  id: string;
  s3_uri: string;
  file_hash: string;
  created_at: string;
  reference_id?: string;
  payload: AnchorPayload;
}

class AnchorService {
  /**
   * Transmits the raw Normalized Image alongside the Secure Enclave signature.
   * Universal Binding: Includes v_hash and optional semantic 'Truth'.
   */
  async uploadDigitalAnchor(
    imageBase64: string, 
    digitalSignature: string,
    bindingVHash?: string,
    semanticContent?: any,
    payloadJson?: string,
    transactionUuid?: string,
    phash?: string,
    referenceId?: string
  ): Promise<AnchorResponse> {
    const idempotencyKey = uuidv4();
    console.log(`[AnchorService] Signing with binding_vhash: ${bindingVHash}`);

    const response = await apiClient.fetchWithAuth(Endpoints.ANCHORS.SIGN, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        digital_signature: digitalSignature,
        binding_vhash: bindingVHash,
        semantic_content: semanticContent,
        payload_json: payloadJson,
        transaction_uuid: transactionUuid,
        phash: phash,
        reference_id: referenceId
      }),
    }, 60000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Anchor upload failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Fetches the document history for the current user.
   */
  async getUserAnchors(): Promise<AnchorResponse[]> {
    const response = await apiClient.fetchWithAuth(Endpoints.ANCHORS.LIST, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to fetch history (${response.status})`);
    }

    return await response.json();
  }
}

export const anchorService = new AnchorService();
