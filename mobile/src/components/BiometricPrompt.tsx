/**
 * BiometricPrompt – Bottom sheet modal for biometric authentication
 *
 * Design spec from Stitch Scanner & Authentication screen:
 * - Glassmorphism background overlay
 * - White rounded bottom sheet
 * - Large fingerprint icon (centered, with subtle pulse animation placeholder)
 * - "Biometric Verification" title
 * - "Confirm Identity" gradient button + "Cancel Signing" secondary button
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import GradientButton from './GradientButton';
import SecondaryButton from './SecondaryButton';
import { Colors, Typography, Radius, Spacing, Glass } from '../theme';

interface BiometricPromptProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function BiometricPrompt({
  visible,
  onConfirm,
  onCancel,
  loading = false,
}: BiometricPromptProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <Text style={styles.title}>Biometric Verification</Text>
        <Text style={styles.subtitle}>
          Authenticate to apply cryptographic signature and finalize document
          processing.
        </Text>

        {/* Biometric trigger – large circle with fingerprint icon */}
        <View style={styles.biometricCircle}>
          <View style={styles.biometricPulse} />
          <MaterialIcons
            name="fingerprint"
            size={64}
            color={Colors.primary}
          />
        </View>

        <GradientButton
          title="Confirm Identity"
          icon="verified-user"
          onPress={onConfirm}
          loading={loading}
          style={styles.confirmBtn}
        />
        <SecondaryButton
          title="Cancel Signing"
          icon="close"
          onPress={onCancel}
          style={styles.cancelBtn}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.outlineVariant,
    borderRadius: Radius.full,
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.headlineMedium,
    color: Colors.onBackground,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  biometricCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    // 15% opacity primary pulse animation (static placeholder)
    borderWidth: 2,
    borderColor: 'rgba(5, 17, 37, 0.15)',
  },
  biometricPulse: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: 'rgba(5, 17, 37, 0.08)',
  },
  confirmBtn: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  cancelBtn: {
    width: '100%',
  },
});
