/**
 * SignVerify Mobile – API Configuration
 *
 * Reads the base URL from the EXPO_PUBLIC_API_URL environment variable.
 * For physical devices, set this to your machine's LAN IP in .env.
 * Falls back to localhost:8000 for simulator testing only.
 */

import Constants from 'expo-constants';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  
  // Fallback for physical devices: Use the host IP from Metro Bundler
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000`;
  }
  
  return 'http://localhost:8000';
};

export const API_BASE_URL = getBaseUrl();

export const Endpoints = {
  AUTH: {
    REQUEST_OTP: '/auth/request-otp',
    VERIFY_OTP: '/auth/verify-otp',
  },
  USERS: {
    REGISTER_KEY: '/users/register-key',
    GET_PUBLIC_KEY: (userId: string) => `/users/${userId}/public-key`,
  },
  ANCHORS: {
    SIGN: '/anchors/sign',
    LIST: '/anchors/',
  },
};
