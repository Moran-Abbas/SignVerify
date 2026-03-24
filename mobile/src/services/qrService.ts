/**
 * SignVerify Mobile – QR Service
 *
 * Utility functions for creating the highly-compressed JSON QR payload.
 */

import { QRPayload } from '../types/document';

export const qrService = {
  /**
   * Constructs a highly-compressed JSON payload for High Density QR Codes.
   * Single-character keys maximize the data-to-pixel ratio, leaving ample capacity 
   * for the mandatory Error Correction Level 'H' matrix.
   */
  buildSignaturePayload: (
    documentHash: string,
    digitalSignature: string,
    signerPublicKeyId: string,
    vHash?: string,
    semanticContent?: any
  ): string => {
    return JSON.stringify({
      u: signerPublicKeyId, // User Key ID
      h: documentHash,      // Anchor Hash
      s: digitalSignature,  // ECDSA Signature
      t: Math.floor(Date.now() / 1000), // Epoch timestamp
      v: vHash || "",       // Visual pHash (v_hash)
      m: semanticContent || null // Semantic 'Truth' JSON
    });
  },

  /**
   * Parses the minified 'H' density QR Code payload back into full data objects
   * for the Verifier Proxy logic flow.
   */
  parsePayload: (rawString: string): QRPayload | null => {
    try {
      const parsed = JSON.parse(rawString);
      if (parsed.u && parsed.h && parsed.s && parsed.t) {
        return {
          signer_public_key_id: parsed.u,
          document_hash: parsed.h,
          digital_signature: parsed.s,
          timestamp: new Date(parsed.t * 1000).toISOString(),
          v_hash: parsed.v,
          semantic_content: parsed.m
        } as QRPayload;
      }
      return null;
    } catch (e) {
      return null; // Invalid JSON payload
    }
  },
};
