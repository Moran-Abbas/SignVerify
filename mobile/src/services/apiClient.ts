/**
 * SignVerify Mobile – API Client
 *
 * Fetch wrapper that automatically attaches the stored JWT access token
 * from expo-secure-store. Includes 401 auto-refresh with a recursion guard.
 */

import { API_BASE_URL } from '../config/api';
import { tokenStorage } from './tokenStorage';

/** Guard flag to prevent infinite 401 → refresh → 401 loops */
let isRefreshing = false;
const DEFAULT_TIMEOUT_MS = 10000;

/** Static registry for session expiration events */
let onSessionExpired: (() => void) | null = null;

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const apiClient = {
  /**
   * Wrapper for standard fetch() that injects Authorization header.
   * Includes a single-retry on 401 via token refresh (with recursion guard).
   */
  async fetchWithAuth(endpoint: string, options: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('[apiClient] fetchWithAuth:', url);

    const token = await tokenStorage.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetchWithTimeout(url, config, timeoutMs);

      // Auto-refresh mechanism on 401 Unauthorized
      // CRITICAL: The isRefreshing guard prevents infinite recursion
      if (response.status === 401 && !isRefreshing) {
        console.log('[apiClient] 401 received, attempting token refresh...');
        isRefreshing = true;

        try {
          const refreshToken = await tokenStorage.getRefreshToken();
          if (!refreshToken) {
            console.log('[apiClient] No refresh token found, session expired');
            await tokenStorage.clearTokens();
            onSessionExpired?.(); // Signal UI to logout
            throw new Error('Session expired. Please log in again.');
          }

          // Attempt to hit the /auth/refresh endpoint using raw fetch (NOT this.fetchWithAuth)
          const refreshRes = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          }, 8000);

          if (refreshRes.ok) {
            const newTokens = await refreshRes.json();
            await tokenStorage.saveTokens(newTokens.access_token, newTokens.refresh_token);
            console.log('[apiClient] Token refresh successful, replaying original request');

            // Replay original request with the new token (single retry, no further refresh)
            const replayedHeaders = { ...headers };
            replayedHeaders['Authorization'] = `Bearer ${newTokens.access_token}`;

            return await fetchWithTimeout(url, { ...config, headers: replayedHeaders }, timeoutMs);
          } else {
            console.log('[apiClient] Refresh token rejected, purging session');
            await tokenStorage.clearTokens();
            onSessionExpired?.(); // Signal UI to logout
            throw new Error('Session expired permanently. Please log in again.');
          }
        } finally {
          isRefreshing = false;
        }
      }

      return response;
    } catch (error) {
      console.log('[apiClient] fetchWithAuth error:', error);
      throw error;
    }
  },

  /**
   * Helper for standard unauthenticated POST (e.g., login, request OTP).
   * Uses raw fetch() — no JWT, no interceptors, no recursion risk.
   */
  async post(endpoint: string, body: object): Promise<Response> {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('[apiClient] POST (unauthenticated):', url);

    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      console.log('[apiClient] POST response status:', response.status);
      return response;
    } catch (error) {
      console.log('[apiClient] POST network error:', error);
      throw error;
    }
  },

  /** Allow AuthContext to register its logout handler */
  setSessionExpiredHandler(handler: () => void) {
    onSessionExpired = handler;
  }
};
