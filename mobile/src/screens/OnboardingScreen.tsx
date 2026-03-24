/**
 * OnboardingScreen
 *
 * Registration flow:
 * - "Welcome to SignVerify" heading (no back button — entry screen)
 * - Phone input with country prefix picker (Israel +972 default, USA +1, etc.)
 * - Leading-zero stripping for E.164 compliance
 * - "Continue" sends OTP via Twilio with ActivityIndicator spinner
 * - 6-digit OTP verification
 * - On success: Secure Enclave key gen → register public key → Dashboard
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientButton, InputField, OTPInput, SecurityChip, LanguageSelector } from '../components';
import { Colors, Typography, Radius, Spacing, Shadows } from '../theme';

import { authService } from '../services/authService';
import { keyManager } from '../services/keyManager';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAuth, signInWithPhoneNumber, getIdToken, FirebaseAuthTypes } from '@react-native-firebase/auth';

import { i18n, Language } from '../i18n/i18n';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

// ── Country Prefix Data ─────────────────────────────────────
interface CountryPrefix {
  code: string;
  name: string;
  flag: string;
  placeholder: string; // Formatted placeholder with dashes
  dashPattern: number[]; // Digit group sizes for auto-dash (e.g., [3,3,4])
}

const COUNTRY_PREFIXES: CountryPrefix[] = [
  { code: '+972', name: 'Israel',  flag: '🇮🇱', placeholder: '000-000-0000', dashPattern: [3, 3, 4] },
  { code: '+1',   name: 'USA',     flag: '🇺🇸', placeholder: '000-000-0000', dashPattern: [3, 3, 4] },
  { code: '+44',  name: 'UK',      flag: '🇬🇧', placeholder: '0000-000-000', dashPattern: [4, 3, 3] },
  { code: '+91',  name: 'India',   flag: '🇮🇳', placeholder: '00000-00000', dashPattern: [5, 5] },
  { code: '+49',  name: 'Germany', flag: '🇩🇪', placeholder: '000-000-0000', dashPattern: [3, 3, 4] },
  { code: '+33',  name: 'France',  flag: '🇫🇷', placeholder: '00-00-00-00-00', dashPattern: [2, 2, 2, 2, 2] },
];

export default function OnboardingScreen() {
  const [rawDigits, setRawDigits] = useState(''); 
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState<CountryPrefix>(COUNTRY_PREFIXES[0]); 
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [confirm, setConfirm] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const { login, isDeviceTrusted } = useAuth();
  const { theme, language, setLanguage } = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  /**
   * 2026 Frictionless Bypass: 
   * If device is trusted, skip the entry screen entirely.
   */
  React.useEffect(() => {
    if (isDeviceTrusted) {
      console.log('[Onboarding] Device trusted. Redirecting to Dashboard...');
      navigation.replace('Dashboard');
    }
  }, [isDeviceTrusted, navigation]);

  /**
   * Formats raw digits with dashes based on the selected country's pattern.
   * e.g., "0506809944" with pattern [3,3,4] → "050-680-9944"
   */
  const formatWithDashes = (digits: string, pattern: number[]): string => {
    let result = '';
    let pos = 0;
    for (let i = 0; i < pattern.length && pos < digits.length; i++) {
      const chunk = digits.substring(pos, pos + pattern[i]);
      result += (i > 0 ? '-' : '') + chunk;
      pos += pattern[i];
    }
    // Append any remaining digits
    if (pos < digits.length) {
      result += digits.substring(pos);
    }
    return result;
  };

  /**
   * Handles phone number input: strips non-digits, stores raw, displays formatted.
   */
  const handlePhoneChange = (text: string) => {
    // Extract only digits from user input
    const digits = text.replace(/\D/g, '');
    setRawDigits(digits);
  };

  /** The display value — raw digits formatted with dashes */
  const displayPhone = formatWithDashes(rawDigits, selectedPrefix.dashPattern);

  /**
   * Formats phone to E.164 standard:
   * 1. Strip spaces, dashes, parentheses
   * 2. Strip leading zero (e.g., 050... → 50...) — critical for Israeli numbers
   * 3. Prepend country code
   *
   * Example: "0506809944" with +972 → "+972506809944"
   */
  const formatE164 = (): string => {
    let digits = rawDigits;
    // Strip leading zero — Israeli/UK numbers start with 0 which must be removed
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    const formatted = `${selectedPrefix.code}${digits}`;
    return formatted;
  };

  /**
   * Handles OTP request using Firebase Phone Auth.
   * This automatically handles reCAPTCHA or APNs silent pushes on iOS.
   */
  const handleContinue = async () => {
    if (rawDigits.length < 7) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number with at least 7 digits.');
      return;
    }

    const formattedPhone = formatE164();
    setLoading(true);
    try {
      const authInstance = getAuth();
      const confirmation = await signInWithPhoneNumber(authInstance, formattedPhone);
      setConfirm(confirmation);
      setShowOTP(true);
    } catch (error: any) {
      Alert.alert(
        'OTP Failed',
        'Could not send verification code. Please check your number and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles OTP verification directly via Firebase, then forwards the ID Token to our backend.
   */
  const handleOTPComplete = async (code: string) => {
    if (!confirm) {
      Alert.alert('Error', 'No active verification session found.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await confirm.confirm(code);

      if (userCredential && userCredential.user) {
        const idToken = await getIdToken(userCredential.user);
        const otpSuccess = await authService.verifyOTP(idToken);

        if (otpSuccess) {
          // Pass the rememberMe flag to the context login
          await login(idToken, userCredential.user, rememberMe);

          const publicKeyPem = await keyManager.generateKeyPair();
          const registerSuccess = await authService.registerPublicKey(publicKeyPem);

          if (registerSuccess) {
            navigation.replace('Dashboard');
          } else {
            Alert.alert(i18n.t('reg_failed'), i18n.t('reg_error'));
          }
        } else {
          Alert.alert(i18n.t('auth_failed'), i18n.t('auth_error'));
        }
      }
    } catch (error: any) {
      Alert.alert(i18n.t('verify_failed'), error.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Welcome Header (no back button) ───────────────── */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{i18n.t('dashboard')}</Text>
            <TouchableOpacity 
              onPress={() => setShowLanguageModal(true)}
              style={styles.langBtn}
            >
              <MaterialIcons name="language" size={20} color={Colors.primary} />
              <Text style={styles.langText}>{language.toUpperCase()}</Text>
              <MaterialIcons name="arrow-drop-down" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* ── Brand Mark ────────────────────────────────────── */}
          <View style={styles.brandSection}>
            <View style={styles.shieldIcon}>
              <MaterialIcons name="verified-user" size={32} color={Colors.onPrimary} />
            </View>
            <Text style={styles.welcomeTitle}>{i18n.t('welcome')}</Text>
            <Text style={styles.welcomeSubtitle}>
              {i18n.t('enter_phone')}
            </Text>
          </View>

          {/* ── Phone Number Card ─────────────────────────────── */}
          <View style={styles.phoneCard}>
            {/* Country prefix selector */}
            <Text style={styles.inputLabel}>{i18n.t('language').toUpperCase()}</Text>
            <TouchableOpacity
              style={styles.prefixSelector}
              onPress={() => {
                setShowPrefixModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.prefixFlag}>{selectedPrefix.flag}</Text>
              <Text style={styles.prefixCode}>{selectedPrefix.code}</Text>
              <Text style={styles.prefixName}>{selectedPrefix.name}</Text>
              <MaterialIcons name="arrow-drop-down" size={20} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>

            <View style={styles.sectionSpacer} />

            {/* Phone number input */}
            <InputField
              label={i18n.t('enter_phone')}
              placeholder={selectedPrefix.placeholder}
              keyboardType="phone-pad"
              value={displayPhone}
              onChangeText={handlePhoneChange}
            />

            {/* Remember Me Toggle */}
            <TouchableOpacity 
              style={styles.rememberRow} 
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                {rememberMe && <MaterialIcons name="check" size={14} color={Colors.onPrimary} />}
              </View>
              <Text style={styles.rememberText}>{i18n.t('remember_device')}</Text>
            </TouchableOpacity>

            {/* Continue button with spinner — 24px gap above */}
            <View style={styles.continueBtnWrapper}>
              <GradientButton
                title={loading ? '' : i18n.t('continue')}
                onPress={handleContinue}
                disabled={loading}
              />
              {loading && (
                <ActivityIndicator
                  size="small"
                  color={Colors.onPrimary}
                  style={styles.spinner}
                />
              )}
            </View>
          </View>

          {/* ── OTP Section (only after OTP sent) ─────────────── */}
          {showOTP && (
            <View style={styles.otpSection}>
              <Text style={styles.otpTitle}>{i18n.t('enter_otp')}</Text>
              <Text style={styles.otpSubtitle}>
                {selectedPrefix.code} {displayPhone}
              </Text>
              <View style={styles.otpInputWrapper}>
                <OTPInput onComplete={handleOTPComplete} onResend={handleContinue} />
              </View>
              {loading && (
                <ActivityIndicator
                  size="small"
                  color={Colors.secondary}
                  style={styles.otpSpinner}
                />
              )}
            </View>
          )}

          {/* ── Footer Security Badge ─────────────────────────── */}
          <View style={styles.footer}>
            <SecurityChip variant="encrypted" />
            <Text style={styles.protocolLabel}>
              ADVANCED CRYPTOGRAPHIC PROTOCOL V4.2
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Language Selector Modal ─────────────────────────── */}
      <LanguageSelector 
        visible={showLanguageModal} 
        onClose={() => setShowLanguageModal(false)} 
      />

      {/* ── Country Prefix Modal ────────────────────────────── */}
      <Modal
        visible={showPrefixModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPrefixModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowPrefixModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowPrefixModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.onBackground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRY_PREFIXES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.prefixOption,
                    item.code === selectedPrefix.code && styles.prefixOptionSelected,
                  ]}
                  onPress={() => {
                    console.log('[Onboarding] Selected prefix:', item.code, item.name);
                    setSelectedPrefix(item);
                    setShowPrefixModal(false);
                  }}
                >
                  <Text style={styles.prefixOptionFlag}>{item.flag}</Text>
                  <Text style={styles.prefixOptionName}>{item.name}</Text>
                  <Text style={styles.prefixOptionCode}>{item.code}</Text>
                  {item.code === selectedPrefix.code && (
                    <MaterialIcons name="check" size={20} color={Colors.secondary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['4xl'],
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.base,
    marginBottom: Spacing['2xl'],
  },
  headerTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 6,
  },
  langText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '700',
  },

  // ── Brand ──────────────────────────────────────────────
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  shieldIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  welcomeTitle: {
    ...Typography.headlineLarge,
    color: Colors.onBackground,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Phone Card ─────────────────────────────────────────
  phoneCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    ...Shadows.ambient,
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  prefixSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  prefixFlag: {
    fontSize: 20,
  },
  prefixCode: {
    ...Typography.bodyMedium,
    color: Colors.onBackground,
    fontWeight: '600',
  },
  prefixName: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    flex: 1,
  },
  sectionSpacer: {
    height: 20,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.base,
    gap: Spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rememberText: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
  },
  continueBtnWrapper: {
    marginTop: 24,
    position: 'relative',
  },
  spinner: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -10,
  },

  // ── OTP Section ────────────────────────────────────────
  otpSection: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing['3xl'],
  },
  otpTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
    marginBottom: Spacing.xs,
  },
  otpSubtitle: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.base,
  },
  otpInputWrapper: {
    marginTop: Spacing.sm,
  },
  otpSpinner: {
    marginTop: Spacing.base,
  },

  // ── Footer ─────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  protocolLabel: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Country Prefix Modal ───────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing['4xl'],
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  modalTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  prefixOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    gap: Spacing.md,
  },
  prefixOptionSelected: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  prefixOptionFlag: {
    fontSize: 22,
  },
  prefixOptionName: {
    ...Typography.bodyMedium,
    color: Colors.onBackground,
    flex: 1,
  },
  prefixOptionCode: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
});
