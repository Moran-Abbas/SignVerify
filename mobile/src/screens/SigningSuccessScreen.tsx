/**
 * SigningSuccessScreen
 *
 * Stitch screen: "Signing Success"
 * - Header: back arrow + "SignVerify" + "SIGNING FLOW" badge
 * - Large green circle with checkmark
 * - "Document Signed Successfully" headline
 * - Subtitle: "Your document is now secured by a cryptographic signature."
 * - QR preview card (simulated document page)
 * - Auth key badge: "AUTH KEY: 0X82A1...9F2C"
 * - Actions: "Share" gradient button + "Save to Photos" secondary button
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientButton, SecondaryButton, SecurityChip } from '../components';
import { Colors, Typography, Radius, Spacing, Shadows } from '../theme';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { qrService } from '../services/qrService';
import { AnchorPayload } from '../services/anchorService';

type Props = NativeStackScreenProps<any, 'SigningSuccess'>;

export default function SigningSuccessScreen({ route, navigation }: Props) {
  // If no payload is provided (e.g. accessed directly during dev), use mock
  const payload: AnchorPayload = route.params?.payload || {
    document_hash: "mock_hash_00000000000",
    digital_signature: "mock_signature_base64_string",
    signer_public_key_id: "mock_pub_key_id"
  };

  const qrString = qrService.buildSignaturePayload(
    payload.document_hash,
    payload.digital_signature,
    payload.signer_public_key_id,
    payload.binding_vhash,
    payload.semantic_content
  );

  const displayKey = String(payload.signer_public_key_id || '').length > 15 
    ? String(payload.signer_public_key_id).substring(0, 15) + '...'
    : String(payload.signer_public_key_id || 'N/A');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.popToTop()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.onBackground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SignVerify</Text>
          <View style={styles.flowBadge}>
            <Text style={styles.flowBadgeText}>SIGNING FLOW</Text>
          </View>
        </View>

        {/* Success icon */}
        <View style={styles.successIconWrap}>
          <View style={styles.successIconOuter}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check" size={48} color={Colors.onSecondary} />
            </View>
          </View>
        </View>

        {/* Titles */}
        <Text style={styles.title}>Document Signed{'\n'}Successfully</Text>
        <Text style={styles.subtitle}>
          Your document is now secured by a cryptographic signature. No QR code required—the paper is the key.
        </Text>

        {/* Visual Identity Card (Replacing QR) */}
        <View style={styles.qrCard}>
          <View style={styles.qrDocument}>
            <View style={styles.docLine} />
            <View style={[styles.docLine, { width: '80%' }]} />
            <View style={styles.docLineSpacer} />
            
            <View style={styles.visualIdHeader}>
              <MaterialIcons name="visibility" size={16} color={Colors.primary} />
              <Text style={styles.visualIdTitle}>VISUAL IDENTITY</Text>
            </View>

            <View style={styles.referenceIdWrap}>
              <Text style={styles.referenceIdLabel}>REFERENCE ID</Text>
              <Text style={styles.referenceId}>{String(route.params?.referenceId || 'AB4X90')}</Text>
            </View>

            <View style={styles.visualHashWrap}>
              <Text style={styles.visualHashLabel}>PHASH (FINGERPRINT)</Text>
              <Text style={styles.visualHash}>{(route.params?.phash || '0x' + payload.document_hash.substring(0, 16)).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Auth key badge */}
        <View style={styles.authKeyBadge}>
          <MaterialIcons name="vpn-key" size={14} color={Colors.onSurfaceVariant} />
          <Text style={styles.authKeyText}>ENCLAVE KEY: {String(displayKey)}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <GradientButton
            title="Share Details"
            icon="share"
            onPress={async () => {
              try {
                await Share.share({
                  message: `SignVerify Proof of Signing\n\nReference ID: ${route.params?.referenceId || 'AB4X90'}\nSigner: ${payload.signer_public_key_id}\n\nThis document is visually indexed. Scan the paper with SignVerify to discover the ledger record.`,
                  title: 'SignVerify – Signed Document',
                });
              } catch (error: any) {
                Alert.alert('Share Failed', error.message);
              }
            }}
            style={styles.shareBtn}
          />
          <SecondaryButton
            title="Back to Dashboard"
            icon="home"
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Dashboard' }],
              });
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['4xl'],
    alignItems: 'center',
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: Spacing.base,
    marginBottom: Spacing['2xl'],
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
    flex: 1,
  },
  flowBadge: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  flowBadgeText: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    letterSpacing: 0.8,
  },

  // ── Success Icon ────────────────────────────────────────
  successIconWrap: {
    marginBottom: Spacing.xl,
  },
  successIconOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.secondaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Content ─────────────────────────────────────────────
  title: {
    ...Typography.headlineLarge,
    color: Colors.onBackground,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
    paddingHorizontal: Spacing.base,
  },

  // ── QR Preview Card (Re-purposed for Visual Identity) ────────────────
  qrCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
    ...Shadows.ambient,
    marginBottom: Spacing.base,
  },
  qrDocument: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  docLine: {
    height: 3,
    width: '100%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  docLineSpacer: {
    height: Spacing.base,
  },
  visualIdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  visualIdTitle: {
    ...Typography.labelSmall,
    color: Colors.primary,
    letterSpacing: 1,
    fontWeight: '700',
  },
  referenceIdWrap: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  referenceIdLabel: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  referenceId: {
    ...Typography.headlineLarge,
    color: Colors.onSurface,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  visualHashWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    width: '100%',
  },
  visualHashLabel: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    fontSize: 8,
    marginBottom: 2,
  },
  visualHash: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
  },

  // ── Auth Key Badge ──────────────────────────────────────
  authKeyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing['2xl'],
    gap: Spacing.xs,
  },
  authKeyText: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },

  // ── Actions ─────────────────────────────────────────────
  actions: {
    width: '100%',
    gap: Spacing.md,
  },
  shareBtn: {
    width: '100%',
  },
});
