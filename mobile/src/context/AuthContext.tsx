import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../services/apiClient';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any | null;
  login: (token: string, user: any, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  isDeviceTrusted: boolean;
  rememberDevice: boolean;
  setRememberDevice: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceTrusted, setIsDeviceTrusted] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  useEffect(() => {
    // Register global logout handler with apiClient
    apiClient.setSessionExpiredHandler(logout);

    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync('user_jwt');
        if (token) {
          // Verify token with backend or just set state
          setIsAuthenticated(true);
          // In a real app, fetch user profile here
        }

        // Check device trust token (30 days)
        const trustToken = await SecureStore.getItemAsync('device_trust_token');
        if (trustToken) {
          const { timestamp } = JSON.parse(trustToken);
          const now = Date.now();
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (now - timestamp < thirtyDays) {
            console.log('[AuthContext] Device is trusted (within 30 days)');
            setIsDeviceTrusted(true);
          } else {
            console.log('[AuthContext] Device trust expired');
            await SecureStore.deleteItemAsync('device_trust_token');
          }
        }
      } catch (e) {
        console.error('Failed to load auth state', e);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (token: string, userInfo: any, remember: boolean) => {
    await SecureStore.setItemAsync('user_jwt', token);
    setIsAuthenticated(true);
    setUser(userInfo);

    if (remember) {
      console.log('[AuthContext] Saving device trust token...');
      const trustToken = JSON.stringify({
        userId: userInfo.localId || userInfo.id,
        timestamp: Date.now(),
      });
      await SecureStore.setItemAsync('device_trust_token', trustToken);
      setIsDeviceTrusted(true);
      setRememberDevice(true);
    }
  };

  const logout = async () => {
    console.log('[AuthContext] Nuclear Logout triggered. Clearing all state...');
    await SecureStore.deleteItemAsync('user_jwt');
    await SecureStore.deleteItemAsync('device_trust_token');
    setIsAuthenticated(false);
    setIsDeviceTrusted(false);
    setRememberDevice(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      login, 
      logout, 
      loading,
      isDeviceTrusted,
      rememberDevice,
      setRememberDevice
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
