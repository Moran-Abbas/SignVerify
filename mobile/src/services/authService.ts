/**
 * SignVerify Mobile – Auth Service
 *
 * Orchestrates the Onboarding Flow:
 * 1. Request Twilio OTP
 * 2. Verify OTP → receive JWT access tokens
 * 3. Register ECDSA public key with backend
 */

import { Endpoints } from '../config/api';
import { apiClient } from './apiClient';
import { tokenStorage } from './tokenStorage';
import { AuthTokens } from '../types/user';

export const authService = {
  /**
   * STEP 2: Verify Firebase ID Token.
   * If successful, saves the returned JWT session tokens to secure storage.
   */
  verifyOTP: async (idToken: string): Promise<boolean> => {
    const res = await apiClient.post(Endpoints.AUTH.VERIFY_OTP, {
      id_token: idToken,
    });

    if (res.ok) {
      const data: AuthTokens = await res.json();
      
      if (!data.access_token || !data.refresh_token) {
        console.error('[AuthService] Missing tokens in 200 OK response:', data);
        throw new Error('Server returned 200 OK but was missing JWT session tokens.');
      }

      await tokenStorage.saveTokens(data.access_token, data.refresh_token);
      return true;
    }
    
    const errorText = await res.text();
    throw new Error(`Server Error (${res.status}): ${errorText}`);
  },

  /**
   * STEP 3: Register the generated ECDSA public key with the backend profile.
   * Requires JWT authentication (must be called after verifyOTP).
   */
  registerPublicKey: async (publicKeyPem: string): Promise<boolean> => {
    const res = await apiClient.fetchWithAuth(Endpoints.USERS.REGISTER_KEY, {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKeyPem }),
    });

    if (res.ok) {
      return true;
    }
    
    const errorText = await res.text();
    throw new Error(`Registration Error (${res.status}): ${errorText}`);
  },

  /**
   * Clears tokens and logs the user out locally.
   */
  logout: async (): Promise<void> => {
    await tokenStorage.clearTokens();
    await tokenStorage.deleteItem('auth_remember_date');
    await tokenStorage.deleteItem('auth_remember_phone');
  },

  /**
   * 30-Day Device Remembrance
   */
  saveRememberMe: async (phone: string) => {
    await tokenStorage.saveItem('auth_remember_date', Date.now().toString());
    await tokenStorage.saveItem('auth_remember_phone', phone);
  },

  isDeviceRemembered: async (phone: string): Promise<boolean> => {
    const savedDate = await tokenStorage.getItem('auth_remember_date');
    const savedPhone = await tokenStorage.getItem('auth_remember_phone');
    
    if (!savedDate || !savedPhone || savedPhone !== phone) return false;
    
    const diffMs = Date.now() - parseInt(savedDate, 10);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays < 30;
  }
};
