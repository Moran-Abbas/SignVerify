/**
 * VerifierScannerScreen
 *
 * Tiered always-on visual search:
 *   Phase 1 – Discovery: fast low-res scan every ~1 s, looking for a candidate.
 *   Phase 2 – Full Verification: high-res confirmation of the candidate.
 *             If MAX_FULL_ATTEMPTS fails in a row, auto-resets to Phase 1 so
 *             the user is never stuck in an infinite "Validating…" loop.
 *
 * Key bug fixes vs previous version:
 *   - Full-verification failures were silently swallowed → now counted and reset.
 *   - Double interval + lastCaptureTime gate meant photos every ~3 s → now ~1 s.
 *   - No visual feedback during full-verification phase → now shows clear status.
 *   - Navigation guard (`hasNavigatedToResults`) prevents double-navigation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { safeHaptics, NotificationFeedbackType } from '../utils/nativeUtils';
import * as ImageManipulator from 'expo-image-manipulator';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScannerOverlay } from '../components';
import { ARProjectionOverlay } from '../components/ARProjectionOverlay';
import { Colors, Typography, Radius, Spacing } from '../theme';

import { imageProcessingService } from '../services/imageProcessingService';
import { apiClient } from '../services/apiClient';
import { Endpoints } from '../config/api';

// After this many consecutive full-verification failures, reset to discovery.
const MAX_FULL_ATTEMPTS = 6;
// Interval between camera captures (ms).
const CAPTURE_INTERVAL_MS = 1000;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VerifierScannerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [verifying, setVerifying] = useState(false);       // manual reference modal loading
  const [isExiting, setIsExiting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Position document inside the frame');

  const [matchData, setMatchData] = useState<any | null>(null);
  const [matchCorners, setMatchCorners] = useState<any[] | null>(null);
  const [candidateToken, setCandidateToken] = useState<string | null>(null);

  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null);
  const [isVerifyingAmount, setIsVerifyingAmount] = useState(false);

  const [flashOn, setFlashOn] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 280, height: 280 });

  const cameraRef = useRef<Camera>(null);
  const isProcessing = useRef(false);
  const hasNavigatedToResults = useRef(false);
  const fullVerifyAttempts = useRef(0);

  if (!hasPermission) {
    requestPermission();
    return <View style={styles.container} />;
  }

  // ── Manual reset: back to discovery ──────────────────────────────────────
  const resetToDiscovery = useCallback((msg = 'Position document inside the frame') => {
    setCandidateToken(null);
    setMatchData(null);
    setMatchCorners(null);
    setStatusMsg(msg);
    isProcessing.current = false;
    fullVerifyAttempts.current = 0;
    hasNavigatedToResults.current = false;
  }, []);

  // ── Navigation helper ─────────────────────────────────────────────────────
  const navigateToResults = useCallback((result: any) => {
    if (hasNavigatedToResults.current) return;
    hasNavigatedToResults.current = true;
    navigation.replace('VerificationResults', {
      isValid: result.verification_state === 'verified',
      forgeryReason: result.forgery_reason,
      timestamp: result?.metadata?.timestamp,
      signerName: result?.metadata?.signer_name,
      signerPhone: result?.metadata?.signer_phone,
      participants: result?.metadata?.all_signer_names || result?.metadata?.participants || [],
      referenceId: result?.metadata?.reference_id,
      anchorId: result?.metadata?.anchor_id,
      confidence: result.confidence,
      cryptographicVerification: {
        signature_valid: result.crypto_passed || false,
        detail: result.crypto_passed ? 'Verified on-chain' : (result.detail || 'Signature check failed')
      },
    });
  }, [navigation]);

  // ── Main verification loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!isFocused || isExiting || showReferenceModal || hasNavigatedToResults.current) return;

    const intervalId = setInterval(async () => {
      if (!cameraRef.current || isProcessing.current) return;

      try {
        isProcessing.current = true;

        const photo = await cameraRef.current.takePhoto({ enableShutterSound: false });
        const uri = `file://${photo.path}`;

        if (!candidateToken) {
          // ── PHASE 1: DISCOVERY ──────────────────────────────────────────
          const { base64 } = await imageProcessingService.prepareFullFrameForDiscovery(uri);

          const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.VERIFY_DOCUMENT, {
            method: 'POST',
            body: JSON.stringify({ image_base64: base64, mode: 'discovery' }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.match_found && result.candidate_token) {
              console.log('[Verifier] Candidate found, transitioning to Full Verification');
              fullVerifyAttempts.current = 0;
              setCandidateToken(result.candidate_token);
              setStatusMsg('Document identified — verifying...');
              safeHaptics.impact();
            }
          } else {
            const result = await response.json();
            if (String(result.detail || '').includes('IMAGE_QUALITY_REJECTED')) {
              setStatusMsg(result.detail.replace('IMAGE_QUALITY_REJECTED: ', ''));
            }
          }
        } else {
          // ── PHASE 2: FULL VERIFICATION (Precision Pre-Crop) ──────────
          // Instead of sending the full frame, we normalize EXIF and crop to the viewport frame.

          // 1. Normalize Orientation
          const normalized = await ImageManipulator.manipulateAsync(uri, []);
          const imgW = normalized.width;
          const imgH = normalized.height;

          // 2. Map Viewport to Sensor ("Cover" Scaling)
          const sensorRatio = imgW / imgH;
          const screenRatio = SCREEN_WIDTH / SCREEN_HEIGHT;
          let scale: number, offsetX = 0, offsetY = 0;

          if (sensorRatio > screenRatio) {
            scale = imgH / SCREEN_HEIGHT;
            offsetX = (imgW - SCREEN_WIDTH * scale) / 2;
          } else {
            scale = imgW / SCREEN_WIDTH;
            offsetY = (imgH - SCREEN_HEIGHT * scale) / 2;
          }

          const cropRect = {
            originX: Math.max(0, Math.floor(offsetX + ((SCREEN_WIDTH - frameSize.width) / 2) * scale)),
            originY: Math.max(0, Math.floor(offsetY + ((SCREEN_HEIGHT - frameSize.height) / 2) * scale)),
            width: Math.min(Math.floor(frameSize.width * scale), imgW),
            height: Math.min(Math.floor(frameSize.height * scale), imgH),
          };

          // 3. Precision Crop
          const croppedUri = await imageProcessingService.cropImage(normalized.uri, cropRect);

          // 4. Normalize to 1024x1024 (Spec)
          const { base64 } = await imageProcessingService.normalizeToBindingSpec(croppedUri);

          const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.VERIFY_DOCUMENT, {
            method: 'POST',
            body: JSON.stringify({
              image_base64: base64,
              mode: 'full',
              candidate_token: candidateToken,
            }),
          });

          if (response.ok) {
            const result = await response.json();

            if (result.verification_state === 'verified') {
              console.log('[Verifier] FULL MATCH CONFIRMED');
              setMatchData(result.metadata);
              if (result.corners) setMatchCorners(result.corners);
              setStatusMsg('High Confidence Match');
              safeHaptics.notification(NotificationFeedbackType.Success);

              // Brief AR feedback window before navigation
              setTimeout(() => navigateToResults(result), 1200);

            } else if (result.verification_state === 'pending_manual_confirmation') {
              console.log('[Verifier] AI Certainty Low - Escalating to Manual Amount entry');
              setPendingAnchorId(result.metadata.anchor_id);
              setStatusMsg('Verification Pending: Confirm the Amount');
              setShowManualModal(true);

            } else if (result.verification_state === 'forged') {
              console.log('[Verifier] FORGERY DETECTED - NAVIGATING TO ERROR');
              safeHaptics.notification(NotificationFeedbackType.Error);
              setStatusMsg('Integrity Violation Detected!');
              
              // Immediate navigation for forgery — high severity
              navigateToResults(result);

            } else if (result.verification_state === 'pending_reference_confirmation') {
              console.log('[Verifier] Semantic check inconclusive — requesting manual reference');
              setStatusMsg('AI uncertain. Enter the 6-digit reference code.');
              setShowReferenceModal(true);

            } else {
              // Any other state (no_match, processing error, etc.) counts as a failure
              let msg = result.detail || '';
              if (msg.includes('IMAGE_QUALITY_REJECTED')) {
                msg = msg.replace('IMAGE_QUALITY_REJECTED: ', '');
              } else {
                fullVerifyAttempts.current += 1;
                const remaining = MAX_FULL_ATTEMPTS - fullVerifyAttempts.current;
                msg = `Verifying document… (${remaining} attempt${remaining !== 1 ? 's' : ''} left)`;
              }

              console.log(
                `[Verifier] Full verification issue: ${result.detail} (attempt ${fullVerifyAttempts.current}/${MAX_FULL_ATTEMPTS})`
              );

              if (fullVerifyAttempts.current >= MAX_FULL_ATTEMPTS) {
                console.log('[Verifier] Max attempts reached — resetting to discovery');
                resetToDiscovery('Hold the document steady and try again.');
              } else {
                setStatusMsg(msg);
              }
            }
          } else {
            // HTTP error during full verification
            fullVerifyAttempts.current += 1;
            if (fullVerifyAttempts.current >= MAX_FULL_ATTEMPTS) {
              resetToDiscovery('Verification error. Please try again.');
            }
          }
        }
      } catch {
        // Silent — network blips during continuous capture are expected
        if (candidateToken) {
          fullVerifyAttempts.current += 1;
          if (fullVerifyAttempts.current >= MAX_FULL_ATTEMPTS) {
            resetToDiscovery('Connection issue. Retrying from discovery...');
          }
        }
      } finally {
        isProcessing.current = false;
      }
    }, CAPTURE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isFocused, isExiting, candidateToken, showReferenceModal, navigateToResults, resetToDiscovery]);

  // ── Manual reference confirmation ─────────────────────────────────────────
  const handleConfirmReference = useCallback(async () => {
    if (!referenceId || !candidateToken) return;

    try {
      setVerifying(true);
      setStatusMsg('Confirming reference code...');

      const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.CONFIRM_REFERENCE, {
        method: 'POST',
        body: JSON.stringify({
          candidate_token: candidateToken,
          reference_id: referenceId.toUpperCase(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setShowReferenceModal(false);
        setVerifying(false);
        safeHaptics.notification(NotificationFeedbackType.Success);
        navigateToResults(result);
      } else {
        const error = await response.json();
        Alert.alert('Verification Failed', error.detail || 'The reference code does not match.');
        setVerifying(false);
        setReferenceId('');
      }
    } catch {
      setVerifying(false);
      Alert.alert('Error', 'Failed to confirm reference.');
    }
  }, [referenceId, candidateToken, navigateToResults]);

  const handleBack = useCallback(() => {
    setIsExiting(true);
    navigation.goBack();
  }, [navigation]);

  // ── Manual amount reconciliation (Trust Elevation T24) ─────────────────────
  const handleConfirmAmount = useCallback(async () => {
    if (!manualAmount || !pendingAnchorId) return;

    try {
      setIsVerifyingAmount(true);
      const response = await apiClient.fetchWithAuth(Endpoints.ANCHORS.VERIFY_AMOUNT, {
        method: 'POST',
        body: JSON.stringify({
          anchor_id: pendingAnchorId,
          amount: parseFloat(manualAmount),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setShowManualModal(false);
        setManualAmount('');
        setIsVerifyingAmount(false);
        if (result.match) {
          safeHaptics.notification(NotificationFeedbackType.Success);
          navigateToResults(result);
        } else {
          safeHaptics.notification(NotificationFeedbackType.Error);
          navigateToResults(result); // This will show the 'forged' state
        }
      } else {
        const error = await response.json();
        Alert.alert('Verification Failed', error.detail || 'Failed to reconcile amount.');
        setIsVerifyingAmount(false);
      }
    } catch {
      setIsVerifyingAmount(false);
      Alert.alert('Connection Error', 'Failed to reach forensic server.');
    }
  }, [manualAmount, pendingAnchorId, navigateToResults]);

  if (!device) return <View style={styles.container} />;

  // Whether we're in full-verification phase (but not yet navigating)
  const isInFullVerification = !!candidateToken && !matchData && !hasNavigatedToResults.current;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SignVerify Verifier</Text>

        <TouchableOpacity
          style={[styles.iconBadge, { marginRight: Spacing.sm }]}
          onPress={() => setFlashOn(f => !f)}
        >
          <MaterialIcons
            name={flashOn ? 'flash-on' : 'flash-off'}
            size={20}
            color={flashOn ? '#FFC107' : 'rgba(255,255,255,0.7)'}
          />
        </TouchableOpacity>

        <View style={styles.iconBadge}>
          <Text style={styles.verifierBadgeText}>VERIFIER</Text>
        </View>
      </View>

      <View style={styles.cameraBackground}>
        <Camera
          style={StyleSheet.absoluteFillObject}
          ref={cameraRef}
          device={device}
          isActive={isFocused && !isExiting && !!hasPermission}
          photo={true}
          torch={flashOn ? 'on' : 'off'}
        />

        <ScannerOverlay
          stepLabel={isInFullVerification ? 'VALIDATING DOCUMENT…' : 'SCANNING FOR DOCUMENT…'}
          stepNumber={isInFullVerification ? 2 : 1}
          totalSteps={2}
          feedbackBadges={
            isInFullVerification
              ? [{ label: 'Candidate Identified', variant: 'success' }]
              : [{ label: 'Discovery Mode Active', variant: 'info' }]
          }
          scanning={!verifying && !isExiting && !matchData}
          statusMsg={statusMsg || undefined}
          onFrameChange={setFrameSize}
        />

        {/* Status pill */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>

        {/* "Reset scan" button visible when stuck in full-verification */}
        {isInFullVerification && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => resetToDiscovery('Position document inside the frame')}
          >
            <MaterialIcons name="refresh" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.resetBtnText}>Reset Scan</Text>
          </TouchableOpacity>
        )}

        {/* AR overlay on confirmed match */}
        {!!(matchCorners && matchData) && (
          <ARProjectionOverlay
            corners={matchCorners}
            frameWidth={1024}
            frameHeight={1024}
            metadata={matchData}
          />
        )}

        {/* Full-screen spinner only during manual reference confirmation */}
        {!!verifying && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.secondary} />
          </View>
        )}
      </View>

      {/* Manual Amount Reconciliation Modal (Trust Elevation T24) */}
      <Modal
        visible={showManualModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowManualModal(false);
          resetToDiscovery('Position document inside the frame');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Amount</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowManualModal(false);
                  resetToDiscovery('Position document inside the frame');
                }}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalBody}>
              AI certainty is below 95%. Please type the exact amount shown on 
              the paper to complete verification.
            </Text>

            <TextInput
              style={styles.manualInput}
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="decimal-pad"
              value={manualAmount}
              onChangeText={setManualAmount}
              autoFocus
            />

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (!manualAmount || isVerifyingAmount) && styles.confirmBtnDisabled
              ]}
              onPress={handleConfirmAmount}
              disabled={!manualAmount || isVerifyingAmount}
            >
              {isVerifyingAmount ? (
                <ActivityIndicator color={Colors.onSecondary} />
              ) : (
                <Text style={styles.confirmBtnText}>Verify & Proceed</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual reference confirmation modal */}
      <Modal
        visible={showReferenceModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowReferenceModal(false);
          resetToDiscovery('Position document inside the frame');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Verification Inconclusive</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowReferenceModal(false);
                  resetToDiscovery('Position document inside the frame');
                }}
              >
                <MaterialIcons name="close" size={24} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalBody}>
              Semantic validation requires manual confirmation. Enter the 6-digit reference
              code printed on the document.
            </Text>

            <TextInput
              style={styles.manualInput}
              placeholder="e.g. AB4X90"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="characters"
              maxLength={6}
              value={referenceId}
              onChangeText={setReferenceId}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.confirmBtn, (!referenceId || verifying) && styles.confirmBtnDisabled]}
              onPress={handleConfirmReference}
              disabled={!referenceId || verifying}
            >
              {verifying ? (
                <ActivityIndicator color={Colors.onSecondary} />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Reference</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primaryContainer },
  cameraBackground: { flex: 1, backgroundColor: '#0A0F1A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.base,
    backgroundColor: Colors.primaryContainer,
    zIndex: 30,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  headerTitle: { ...Typography.titleMedium, color: '#FFFFFF', flex: 1 },
  iconBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifierBadgeText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 50,
    maxWidth: '80%',
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetBtn: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 50,
  },
  resetBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.primaryContainer,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: { ...Typography.titleLarge, color: '#FFF' },
  modalBody: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.lg,
  },
  manualInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    height: 64,
    paddingHorizontal: Spacing.md,
    color: '#FFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  confirmBtn: {
    backgroundColor: Colors.secondary,
    height: 56,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: {
    ...Typography.titleMedium,
    color: Colors.onSecondary,
    fontWeight: '700',
  },
});
