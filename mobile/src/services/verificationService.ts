/**
 * SignVerify Mobile – Verification Service
 *
 * Handles the client-side cryptographic verification of the Document_Hash
 * against the Digital_Signature using the fetched Public Key.
 */

import { apiClient } from './apiClient';
import { Buffer } from 'buffer';
// @ts-ignore - React Native moduleResolution does not natively resolve Node16 package exports
import { p256 } from '@noble/curves/p256';

export interface PublicKeyResult {
  public_key: string;
}

export const verificationService = {
  /**
   * Fetches the Signer's Public Key from the PostgreSQL backend 
   * via the FastAPI endpoint.
   */
  fetchPublicKey: async (signerId: string): Promise<string | null> => {
    try {
      // In a real environment, the JWT or public endpoint must allow this read.
      const res = await apiClient.fetchWithAuth(`/users/${signerId}/public-key`, {
        method: 'GET',
      });

      if (res.ok) {
        const data: PublicKeyResult = await res.json();
        return data.public_key;
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  /**
   * Cryptographically verifies the signature.
   * 
   * Expects:
   * - hash: SHA-256 hex string (Document_Hash)
   * - signature: Base64 string (Digital_Signature from Keystore)
   * - publicKeyPem: PEM formatted string (fetched from DB)
   */
  verifySignature: (hash: string, signatureBase64: string, publicKeyPem: string): boolean => {
    try {
      // 1. Convert Payload Hex Hash to Uint8Array
      const hashBytes = Uint8Array.from(Buffer.from(hash, 'hex'));
      
      // 2. Convert Base64 Signature (Hardware Enclave DER) to Uint8Array
      const sigBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
      
      // 3. Extract Raw Public Key from PEM envelope
      const pemContent = publicKeyPem
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '');
        
      const spkiBytes = Uint8Array.from(Buffer.from(pemContent, 'base64'));
      
      // SubjectPublicKeyInfo (SPKI) for P-256 has ASN.1 OID headers.
      // We automatically strip the headers to isolate the exact 65-byte uncompressed 
      // coordinate payload (which explicitly begins with the 0x04 format indicator).
      let rawPubKey = spkiBytes;
      if (spkiBytes.length > 65 && spkiBytes[spkiBytes.length - 65] === 0x04) {
        rawPubKey = spkiBytes.slice(spkiBytes.length - 65);
      }

      // 4. Mathematically verify standard using @noble/curves execution
      return p256.verify(sigBytes, hashBytes, rawPubKey);
      
    } catch (e) {
      return false;
    }
  }
};
