/**
 * VerifierScannerScreen
 *
 * Orchestrates:
 * 1. Tiered Always-On Visual Search (Discovery -> Full Verification)
 * 2. Manual Reference Confirmation Fallback
 * 3. AR Match Overlay for instant feedback
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { safeHaptics, NotificationFeedbackType } from '../utils/nativeUtils';
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

export default function VerifierScannerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [verifying, setVerifying] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Position document inside the frame');
  
  const [matchData, setMatchData] = useState<any | null>(null);
  const [matchCorners, setMatchCorners] = useState<any[] | null>(null);
  const [candidateToken, setCandidateToken] = useState<string | null>(null);
  
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceId, setReferenceId] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  
  const cameraRef = useRef<Camera>(null);
  const isProcessing = useRef(false);
  const lastCaptureTime = useRef(0);
  const hasNavigatedToResults = useRef(false);

  // Permission Guard
  if (!hasPermission) {
    requestPermission();
    return <View style={styles.container} />;
  }

  /**
   * Reset the entire verification state
   */
  const resetFlow = useCallback(() => {
    setMatchData(null);
    setMatchCorners(null);
    setCandidateToken(null);
    setVerifying(false);
    setStatusMsg('Position document inside the frame');
    hasNavigatedToResults.current = false;
    isProcessing.current = false;
  }, []);

  /**
   * Logic: Tiered Verification Loop
   * 1. Discovery Mode: Frequent, low-res full-frame scan.
   * 2. Full Mode: Occasional, high-res full-frame scan (only when candidate exists).
   */
  useEffect(() => {
    if (!isFocused || isExiting || showReferenceModal || hasNavigatedToResults.current) return;

    const intervalId = setInterval(async () => {
      if (!cameraRef.current || isProcessing.current) return;
      
      const now = Date.now();
      if (now - lastCaptureTime.current < 1500) return;
      
      try {
        isProcessing.current = true;
        
        // Take a photo for analysis
        const photo = await cameraRef.current.takePhoto({ enableShutterSound: false });
        lastCaptureTime.current = Date.now();
        const uri = `file://${photo.path}`;

        if (!candidateToken) {
          // --- PHASE 1: DISCOVERY ---
          const { base64 } = await imageProcessingService.prepareFullFrameForDiscovery(uri);
          
          const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.VERIFY_DOCUMENT, {
            method: 'POST',
            body: JSON.stringify({
              image_base64: base64,
              mode: 'discovery'
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.match_found && result.candidate_token) {
              console.log('[Verifier] Candidate found, transitioning to Full Verification');
              setCandidateToken(result.candidate_token);
              setStatusMsg('Document identified. Verifying stability...');
            }
          }
        } else {
          // --- PHASE 2: FULL VERIFICATION ---
          const { base64 } = await imageProcessingService.prepareFullFrameForVerification(uri);
          
          const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.VERIFY_DOCUMENT, {
            method: 'POST',
            body: JSON.stringify({
              image_base64: base64,
              mode: 'full',
              candidate_token: candidateToken
            }),
          });

          if (response.ok) {
            const result = await response.json();
            
            if (result.verification_state === 'verified') {
              console.log('[Verifier] FULL MATCH CONFIRMED');
              setMatchData(result.metadata);
              if (result.corners) setMatchCorners(result.corners);
              
              setStatusMsg('✅ High Confidence Match');
              safeHaptics.notification(NotificationFeedbackType.Success);
              
              // Delay slightly for AR feedback before navigation
              setTimeout(() => {
                if (!hasNavigatedToResults.current) {
                  hasNavigatedToResults.current = true;
                  navigation.replace('VerificationResults', {
                    isValid: true,
                    timestamp: result.metadata.timestamp,
                    signerName: result.metadata.signer_name,
                    signerPhone: result.metadata.signer_phone,
                    participants: result.metadata.all_signer_names || result.metadata.participants || [],
                    referenceId: result.metadata.reference_id,
                    anchorId: result.metadata.anchor_id,
                    confidence: result.confidence,
                    cryptographicVerification: true
                  });
                }
              }, 1200);
            } else if (result.verification_state === 'pending_reference_confirmation') {
              console.log('[Verifier] Semantic check inconclusive. Requesting manual reference.');
              setStatusMsg('❓ AI Uncertain. Please enter reference code.');
              setShowReferenceModal(true);
            } else {
              // Failed full check or lost candidate
              // setCandidateToken(null);
              // setStatusMsg('Stability lost. Re-focusing...');
            }
          } else {
             // If full check fails repeatedly, could reset candidate
             // setCandidateToken(null);
          }
        }
      } catch (err) {
        // Silently ignore loop errors
      } finally {
        isProcessing.current = false;
      }
    }, 1500);

    return () => clearInterval(intervalId);
  }, [isFocused, isExiting, candidateToken, showReferenceModal, navigation]);

  /**
   * Manual Reference Confirmation
   */
  const handleConfirmReference = useCallback(async () => {
    if (!referenceId || !candidateToken) return;
    
    try {
      setVerifying(true);
      setStatusMsg('Confirming reference code...');
      
      const response = await apiClient.fetchWithAuth(Endpoints.SIGNATURES.CONFIRM_REFERENCE, {
        method: 'POST',
        body: JSON.stringify({
          candidate_token: candidateToken,
          reference_id: referenceId.toUpperCase()
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setShowReferenceModal(false);
        setVerifying(false);
        
        safeHaptics.notification(NotificationFeedbackType.Success);
        navigation.replace('VerificationResults', {
          isValid: true,
          timestamp: result.metadata.timestamp,
          signerName: result.metadata.signer_name,
          signerPhone: result.metadata.signer_phone,
          participants: result.metadata.all_signer_names || result.metadata.participants || [],
          referenceId: result.metadata.reference_id,
          anchorId: result.metadata.anchor_id,
          confidence: result.confidence,
          cryptographicVerification: true
        });
      } else {
        const error = await response.json();
        Alert.alert('Verification Failed', error.detail || 'The reference code does not match.');
        setVerifying(false);
        setReferenceId('');
      }
    } catch (err) {
      setVerifying(false);
      Alert.alert('Error', 'Failed to confirm reference.');
    }
  }, [referenceId, candidateToken, navigation]);

  const handleBack = useCallback(() => {
    setIsExiting(true);
    navigation.goBack();
  }, [navigation]);

  if (!device) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Optimized Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SignVerify Verifier</Text>
        
        <TouchableOpacity 
          style={[styles.verifierBadge, { marginRight: Spacing.sm }]} 
          onPress={() => setFlashOn(!flashOn)}
        >
          <MaterialIcons name={flashOn ? "flash-on" : "flash-off"} size={20} color={flashOn ? "#FFC107" : "rgba(255,255,255,0.7)"} />
        </TouchableOpacity>

        <View style={styles.verifierBadge}>
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
          stepLabel={candidateToken ? 'VALIDATING DOCUMENT...' : 'SEARCHING FOR DOCUMENT...'}
          stepNumber={candidateToken ? 2 : 1}
          totalSteps={2}
          feedbackBadges={candidateToken ?
            [{ label: 'Candidate Identified', variant: 'success' }] :
            [{ label: 'Discovery Mode Active', variant: 'info' }]}
          scanning={!verifying && !isExiting && !matchData}
          statusMsg={statusMsg || undefined}
          onFrameChange={() => {}} // Verifier uses full-frame now
        />

        {/* Actionable Hint */}
        {!!statusMsg && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        )}

        {/* AR Projection Layer */}
        {!!(matchCorners && matchData) && (
          <ARProjectionOverlay 
            corners={matchCorners}
            frameWidth={1024} // Unified verifier frame target
            frameHeight={1024}
            metadata={matchData}
          />
        )}

        {/* Verifying Loader */}
        {!!verifying && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.secondary} />
          </View>
        )}
      </View>

      {/* Reference Confirmation Modal */}
      <Modal
        visible={showReferenceModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReferenceModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Verification Inconclusive</Text>
              <TouchableOpacity onPress={() => setShowReferenceModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalBody}>
              Semantic validation requires manual confirmation. Please enter the 6-digit reference code from the paper document.
            </Text>

            <TextInput
              style={styles.manualInput}
              placeholder="e.g. AB4X90"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="characters"
              maxLength={6}
              value={referenceId}
              onChangeText={setReferenceId}
            />

            <TouchableOpacity 
              style={[styles.confirmBtn, !referenceId && styles.confirmBtnDisabled]} 
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
  container: {
    flex: 1,
    backgroundColor: Colors.primaryContainer,
  },
  cameraBackground: {
    flex: 1,
    backgroundColor: '#0A0F1A',
  },
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
  headerTitle: {
    ...Typography.titleMedium,
    color: '#FFFFFF',
    flex: 1,
  },
  verifierBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  verifierBadgeText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 50,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
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
  modalTitle: {
    ...Typography.titleLarge,
    color: '#FFF',
  },
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
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    ...Typography.titleMedium,
    color: Colors.onSecondary,
    fontWeight: '700',
  },
});
