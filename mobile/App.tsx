/**
 * SignVerify – App Entry Point
 *
 * Loads custom fonts (Manrope + Inter from Google Fonts),
 * then renders the DashboardScreen as the default view.
 *
 * Note: Navigation is kept simple for the baseline scaffold.
 * Replace with a full React Navigation stack when connecting flows.
 */

import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from './src/theme';
import DashboardScreen from './src/screens/DashboardScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import SigningSuccessScreen from './src/screens/SigningSuccessScreen';
import VerifierScannerScreen from './src/screens/VerifierScannerScreen';
import VerificationResultsScreen from './src/screens/VerificationResultsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AnchorDetailsScreen from './src/screens/AnchorDetailsScreen';

import { AppProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';

const Stack = createNativeStackNavigator();

// Keep splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { theme, language } = useAppContext();
  const { isAuthenticated, isDeviceTrusted, loading: authLoading } = useAuth();
  const isRTL = language === 'he' || language === 'ar';

  const onLayoutRootView = useCallback(async () => {
    if (!authLoading) {
      await SplashScreen.hideAsync();
    }
  }, [authLoading]);

  if (authLoading) return null;

  return (
    <View 
      style={[styles.container, { backgroundColor: theme === 'dark' ? '#0A0F1A' : '#F8F9FA' }]} 
      onLayout={onLayoutRootView}
    >
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated || isDeviceTrusted ? (
            <>
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="Scanner" component={ScannerScreen} />
              <Stack.Screen name="SigningSuccess" component={SigningSuccessScreen} />
              <Stack.Screen name="VerifierScanner" component={VerifierScannerScreen} />
              <Stack.Screen name="VerificationResults" component={VerificationResultsScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="AnchorDetails" component={AnchorDetailsScreen} />
            </>
          ) : (
            <Stack.Screen 
              name="Onboarding" 
              component={OnboardingScreen}
              options={{ headerLeft: () => null, gestureEnabled: false, animation: 'fade' }}
            />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <AuthProvider>
          <RootContent />
        </AuthProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
});
