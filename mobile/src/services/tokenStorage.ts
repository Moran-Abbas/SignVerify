/**
 * SignVerify Mobile – Secure Token Storage
 *
 * Wraps expo-secure-store to securely save JWT access and refresh tokens.
 */

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'signverify_access_token';
const REFRESH_TOKEN_KEY = 'signverify_refresh_token';

export const tokenStorage = {
  saveTokens: async (accessToken: string, refreshToken: string): Promise<void> => {
    try {
      if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
        console.error('[TokenStorage] Invalid token types:', typeof accessToken, typeof refreshToken);
        throw new Error('Attempted to save non-string tokens to SecureStore.');
      }
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    } catch (error) {
      throw error;
    }
  },

  getAccessToken: async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  },

  /**
   * Securely retrieve the refresh JWT.
   */
  getRefreshToken: async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  },

  clearTokens: async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
    }
  },

  // ── Generic Storage ──────────────────────────────────────
  
  saveItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },

  getItem: async (key: string): Promise<string | null> => {
    return await SecureStore.getItemAsync(key);
  },

  deleteItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  }
};
