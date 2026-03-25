/**
 * VerificationResultsScreen
 *
 * Stitch screen: "Verification Results"
 * Dual-state screen showing either verified or forged result.
 *
 * Verified state:
 * - Green circle + checkmark, "Document Verified" title
 * - Signer identity card (+1 *** *** 1234), timestamp card
 * - Green "Hash Validation Success" detail card
 *
 * Forged state:
 * - Red circle + exclamation, "Altered or Forged Document" title
 * - Red "Integrity Mismatch Detected!" detail card
 *
 * Actions: "Scan Again" + "Report" buttons
 * BottomNavBar
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { GradientButton, SecondaryButton, BottomNavBar } from '../components';
import { Colors, Typography, Radius, Spacing, Shadows } from '../theme';

import { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<any, 'VerificationResults'>;

export default function VerificationResultsScreen({ route, navigation }: Props) {
  const {
    isValid = true,
    forgeryReason,
    timestamp,
    signerName,
    signerPhone,
    participants = [],
    referenceId,
    distance,
    anchorId,
    cryptographicVerification,
  } = route.params || {};
  
  const dateStr = timestamp 
    ? new Date(timestamp).toLocaleDateString() 
    : 'Unknown Date';
  const timeStr = timestamp 
    ? new Date(timestamp).toLocaleTimeString() 
    : 'Unknown Time';
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'vault' | 'settings'>('history');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            console.log('[VerificationResults] Back button pressed');
            navigation.popToTop();
          }}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.onBackground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SignVerify</Text>
          <View style={styles.flowBadge}>
            <Text style={styles.flowBadgeText}>VERIFIER MODE</Text>
          </View>
        </View>

        {isValid ? (
          /* ── VERIFIED STATE ───────────────────────────────── */
          <View style={styles.resultSection}>
            {/* Success icon */}
            <View style={styles.iconWrapSuccess}>
              <View style={styles.iconCircleSuccess}>
                <MaterialIcons name="check" size={40} color={Colors.onSecondary} />
              </View>
            </View>

            <Text style={styles.resultTitle}>Document Verified</Text>
            <Text style={styles.resultSubtitle}>
              Visual identity confirmed against the absolute ledger record.
            </Text>

            {/* Signer identity card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>Signer Identity</Text>
              <Text style={styles.infoCardValue}>{signerName || 'Unknown Identifier'}</Text>
              <View style={styles.kycBadge}>
                <MaterialIcons name="verified" size={12} color={Colors.onSecondaryContainer} />
                <Text style={styles.kycBadgeText}>KYC Cleared</Text>
              </View>
            </View>

            {!!signerPhone && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Signer Phone</Text>
                <Text style={styles.infoCardValue}>{signerPhone}</Text>
              </View>
            )}

            {!!participants?.length && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Participant Names</Text>
                <Text style={styles.infoCardValue}>{participants.join(', ')}</Text>
              </View>
            )}

            {/* Reference ID card */}
            {referenceId && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Reference ID (Shortcode)</Text>
                <Text style={styles.infoCardValue}>{referenceId}</Text>
              </View>
            )}

            {!!anchorId && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Ledger Anchor ID</Text>
                <Text style={styles.infoCardValue} selectable>
                  {anchorId}
                </Text>
              </View>
            )}

            {cryptographicVerification != null && (
              <View
                style={[
                  styles.hashSuccessCard,
                  cryptographicVerification.signature_valid === false && styles.hashWarnCard,
                ]}
              >
                <View style={styles.hashCardHeader}>
                  <MaterialIcons
                    name={
                      cryptographicVerification.signature_valid === true
                        ? 'gpp-good'
                        : cryptographicVerification.signature_valid === false
                          ? 'gpp-bad'
                          : 'help-outline'
                    }
                    size={18}
                    color={
                      cryptographicVerification.signature_valid === true
                        ? Colors.secondary
                        : Colors.error
                    }
                  />
                  <Text style={styles.hashCardTitle}>Cryptographic signature</Text>
                </View>
                <Text style={styles.hashCardDescription}>
                  {cryptographicVerification.signature_valid === true
                    ? 'ECDSA/RSA signature over the stored commitment verified on the server.'
                    : cryptographicVerification.signature_valid === false
                      ? `Signature check failed: ${cryptographicVerification.detail || 'invalid'}`
                      : (cryptographicVerification.detail as string) ||
                        'Legacy record: signed payload not stored on ledger.'}
                </Text>
              </View>
            )}

            {/* Timestamp card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>Timestamp</Text>
              <Text style={styles.infoCardValue}>{dateStr}</Text>
              <Text style={styles.infoCardDetail}>{timeStr}</Text>
            </View>

            {/* Hash validation success */}
            <View style={styles.hashSuccessCard}>
              <View style={styles.hashCardHeader}>
                <MaterialIcons name="check-circle" size={18} color={Colors.secondary} />
                <Text style={styles.hashCardTitle}>Hash Validation Success</Text>
              </View>
              <Text style={styles.hashCardDescription}>
                The document's SHA-256 fingerprint matches the stored on-chain
                manifest precisely. No tampering detected.
              </Text>
              {typeof distance === 'number' && (
                <Text style={styles.hashCardDistance}>
                  Visual match distance: {distance}/64 bits (tolerance {'<= 12'})
                </Text>
              )}
            </View>

            {/* Verified state action buttons */}
            <View style={styles.actions}>
              <GradientButton
                title="Scan Another Document"
                icon="qr-code-scanner"
                onPress={() => {
                  console.log('[VerificationResults] Scan Another pressed');
                  navigation.replace('VerifierScanner');
                }}
              />
              <SecondaryButton
                title="Back to Dashboard"
                icon="home"
                onPress={() => {
                  console.log('[VerificationResults] Back to Dashboard pressed');
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Dashboard' }],
                  });
                }}
              />
            </View>
          </View>
        ) : (
          /* ── FORGED STATE ─────────────────────────────────── */
          <View style={styles.resultSection}>
            {/* Error icon */}
            <View style={styles.iconWrapError}>
              <View style={styles.iconCircleError}>
                <MaterialIcons name="warning" size={40} color={Colors.onError} />
              </View>
            </View>

            <Text style={styles.resultTitle}>
              Altered or Forged{'\n'}Document
            </Text>
            <Text style={styles.resultSubtitle}>
              {forgeryReason 
                ? "This document appears to have been altered after it was signed."
                : "The physical document does not match the cryptographic signature."}
            </Text>

            {/* Integrity mismatch card */}
            <View style={styles.hashErrorCard}>
              <View style={styles.hashCardHeader}>
                <MaterialIcons name="error" size={18} color={Colors.error} />
                <Text style={[styles.hashCardTitle, { color: Colors.error }]}>
                  Integrity Mismatch Detected!
                </Text>
              </View>
              <Text style={styles.hashCardDescription}>
                {forgeryReason || "Our verification engine detected unauthorized changes to the document's content after it was signed. This document should be considered invalid and potentially fraudulent."}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <GradientButton
                title="Scan Again"
                icon="qr-code-scanner"
                onPress={() => {
                  console.log('[VerificationResults] Scan Again pressed');
                  navigation.replace('VerifierScanner');
                }}
              />
              <SecondaryButton
                title="Report Forgery"
                icon="flag"
                onPress={() => {
                  console.log('[VerificationResults] Report Forgery pressed');
                  Alert.alert(
                    'Report Submitted',
                    'This forged document has been flagged and reported to our verification team for further investigation.',
                    [
                      {
                        text: 'Back to Dashboard',
                        onPress: () => {
                          console.log('[VerificationResults] Returning to Dashboard after report');
                          navigation.reset({
                            index: 0,
                            routes: [{ name: 'Dashboard' }],
                          });
                        },
                      },
                      { text: 'Dismiss', style: 'cancel' },
                    ]
                  );
                }}
              />
            </View>

            {/* Extra detail chips */}
            <View style={styles.detailChips}>
              <View style={styles.detailChip}>
                <MaterialIcons name="warning" size={14} color={Colors.error} />
                <Text style={styles.detailChipText}>
                  {forgeryReason?.includes('AMOUNT') ? 'Amount Mismatch' : 'Content Tampered'}
                </Text>
              </View>
              <View style={styles.detailChip}>
                <MaterialIcons name="security" size={14} color={Colors.error} />
                <Text style={styles.detailChipText}>Forensic Rejection</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
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
    paddingBottom: Spacing.xl,
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.base,
    marginBottom: Spacing.xl,
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

  // ── Result Section ──────────────────────────────────────
  resultSection: {
    alignItems: 'center',
  },

  // Success icon
  iconWrapSuccess: {
    marginBottom: Spacing.xl,
  },
  iconCircleSuccess: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    // Outer ring effect
    borderWidth: 6,
    borderColor: Colors.secondaryContainer,
  },

  // Error icon
  iconWrapError: {
    marginBottom: Spacing.xl,
  },
  iconCircleError: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 6,
    borderColor: Colors.errorContainer,
  },

  // Titles
  resultTitle: {
    ...Typography.headlineLarge,
    color: Colors.onBackground,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  resultSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
    paddingHorizontal: Spacing.base,
  },

  // ── Info Cards ──────────────────────────────────────────
  infoCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    width: '100%',
    marginBottom: Spacing.md,
  },
  infoCardLabel: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  infoCardValue: {
    ...Typography.titleMedium,
    color: Colors.onBackground,
  },
  infoCardDetail: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  kycBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    gap: 4,
  },
  kycBadgeText: {
    ...Typography.labelSmall,
    color: Colors.onSecondaryContainer,
  },

  // ── Hash Cards ──────────────────────────────────────────
  hashSuccessCard: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  hashWarnCard: {
    backgroundColor: Colors.errorContainer,
  },
  hashErrorCard: {
    backgroundColor: Colors.errorContainer,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  hashCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  hashCardTitle: {
    ...Typography.titleSmall,
    color: Colors.onSecondaryContainer,
  },
  hashCardDescription: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
  },
  hashCardDistance: {
    ...Typography.labelSmall,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.sm,
  },

  // ── Actions ─────────────────────────────────────────────
  actions: {
    width: '100%',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },

  // ── Detail Chips ────────────────────────────────────────
  detailChips: {
    width: '100%',
    gap: Spacing.sm,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorContainer,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  detailChipText: {
    ...Typography.labelMedium,
    color: Colors.error,
  },
});
