/**
 * SignVerify Mobile – Hash Service
 *
 * Provides SHA-256 hashing for the Document_Hash generated from the OCR output.
 */

import * as Crypto from 'expo-crypto';

export const hashService = {
  /**
   * Generates a SHA-256 hash (hex string) for the provided plaintext.
   */
  hashText: async (text: string): Promise<string> => {
    try {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        text,
        { encoding: Crypto.CryptoEncoding.HEX }
      );
      
      return digest;
    } catch (error) {
      throw error;
    }
  },
};
