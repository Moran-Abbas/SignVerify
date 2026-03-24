/**
 * SignVerify Mobile – Signing Service
 *
 * Handles the backend logging of the signing metadata (no images of the document).
 */

import { apiClient } from './apiClient';

export interface SigningLogPayload {
  document_hash: string;
  digital_signature: string;
  signer_public_key_id: string;
}

export const signingService = {
  /**
   * Submits the signing metadata to the FastAPI backend.
   * Requires JWT authentication.
   */
  logSigningEvent: async (payload: SigningLogPayload): Promise<boolean> => {
    try {
      const res = await apiClient.fetchWithAuth('/signing/log', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return true;
      }

      const errorData = await res.json();
      return false;
    } catch (error) {
      return false;
    }
  },
};
