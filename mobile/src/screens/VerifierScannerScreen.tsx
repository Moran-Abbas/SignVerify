/**
 * VerifierScannerScreen
 *
 * Orchestrates:
 * 1. Always-On Visual Search (Discovery Loop)
 * 2. Manual Capture fallback via shutter button
 * 3. Manual Reference ID (Shortcode) entry fallback
 * 4. AR Match Overlay for instant feedback
 * 5. Navigation to Results UI
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { safeHaptics, NotificationFeedbackType } from '../utils/nativeUtils';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScannerOverlay } from '../components';
import { ARProjectionOverlay } from '../components/ARProjectionOverlay';
import { Colors, Typography, Radius, Spacing } from '../theme';

import { imageProcessingService } from '../services/imageProcessingService';
import { apiClient } from '../services/apiClient';

export default function VerifierScannerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();

  const [verifying, setVerifying] = useState(false);
  const [isExiting, setIsExiting] = useState(false); // 2026 Perf Fix
  const [statusMsg, setStatusMsg] = useState('Position document inside the frame');
  
  const [matchData, setMatchData] = useState<any | null>(null);
  const [matchCorners, setMatchCorners] = useState<any[] | null>(null);
  const [frameInfo, setFrameInfo] = useState({ width: 0, height: 0 });
  const [viewfinderSize, setViewfinderSize] = useState({ width: 320, height: 240 });
  const [showManualInput, setShowManualInput] = useState(false);
  const [searchTimer, setSearchTimer] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [cameraContainerSize, setCameraContainerSize] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  
  const cameraRef = useRef<Camera>(null);
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  // Permission Guard
  if (!hasPermission) {
    requestPermission();
    return <View style={styles.container} />;
  }

  const isProcessing = useRef(false); // 2026 Concurrency Lock
  const lastCaptureTime = useRef(0);
  const lastMatchTime = useRef(0); // For AR Stability
  const frameProbeEvery = useRef(0);
  const hasNavigatedToResults = useRef(false);
  /** Ring buffer of recent dHashes for multi-frame fusion (up to 5). */
  const recentVHashesRef = useRef<string[]>([]);
  /** Consensus map: anchor_id -> count (tracks stable detections). */
  const matchConsensus = useRef<Record<string, number>>({});
  const [matchDetails, setMatchDetails] = useState<any>(null); // For rich forensic feedback

  // --- Fail-safe: Reset Consensus if stuck ---
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (Object.keys(matchConsensus.current).length > 0 && !matchData) {
      timeout = setTimeout(() => {
        console.log('[VerifierScanner] Consensus Timed Out. Resetting.');
        matchConsensus.current = {};
        setMatchDetails(null);
        setStatusMsg('Stability lost. Re-focusing...');
      }, 10000); // 10 seconds of partial matching without finalization
    }
    return () => clearTimeout(timeout);
  }, [matchDetails, matchData]);

  /**
   * Always-On Visual Search (Discovery Loop)
   * Captures a snapshot every ~1.5s, normalizes, computes 64-bit vHash,
   * then performs backend fuzzy matching (Hamming threshold <= 16).
   */
  React.useEffect(() => {
    if (!isFocused || verifying || isExiting || matchData || showManualInput) return;

    const intervalId = setInterval(async () => {
      if (!cameraRef.current || isProcessing.current) return;
      
      const now = Date.now();
      if (now - lastCaptureTime.current < 1500) return; // Strict throttle
      
      try {
        isProcessing.current = true;
        console.log('[VerifierScanner] Auto-Discovery: capturing candidate frame...');
        const photo = await cameraRef.current.takePhoto({ 
          enableShutterSound: false 
        });
        
        lastCaptureTime.current = Date.now();
        
        
        // Normalize frame into canonical 1024x1024 visual binding image.
        // 2026 Spec: Pass dynamic viewfinder size and screen dimensions for functional cropping
        const normalized = await imageProcessingService.normalizeForVerifier(
          `file://${photo.path}`,
          viewfinderSize,
          cameraContainerSize,
          'camera'
        );
        setFrameInfo({ width: normalized.width, height: normalized.height });
        const vHash = imageProcessingService.computeVHashFromBase64(normalized.base64);
        const ring = recentVHashesRef.current.filter((h) => h !== vHash);
        ring.unshift(vHash);
        recentVHashesRef.current = ring.slice(0, 5);

        const vhashRes = await apiClient.fetchWithAuth('/signatures/verify-vhash', {
          method: 'POST',
          body: JSON.stringify({
            v_hashes: recentVHashesRef.current,
          }),
        });

        if (vhashRes.ok) {
          const vResult = await vhashRes.json();
          if (vResult.match_found) {
            console.log('[VerifierScanner] vHASH MATCH FOUND:', vResult.metadata.signer_name);
            const anchorId = vResult.metadata.anchor_id;
            
            // --- Phase 1: AR Tentative Seal ---
            setMatchData(vResult.metadata);
            setMatchCorners([
              { x: 180, y: 180 }, { x: 180, y: 844 },
              { x: 844, y: 844 }, { x: 844, y: 180 }
            ]);

            // --- Phase 2: High-Fidelity Refinement ---
            const frameRes = await apiClient.fetchWithAuth('/signatures/verify-frame', {
              method: 'POST',
              body: JSON.stringify({ image_base64: normalized.base64 }),
            });
            
            if (frameRes.ok) {
              const frameJson = await frameRes.json();
              if (frameJson?.match_found && Array.isArray(frameJson?.corners) && frameJson.corners.length === 4) {
                setMatchCorners(frameJson.corners);
                
                // --- Phase 3: Temporal Consensus (The "Winning Streak") ---
                // Only trigger navigation if we've seen this SAME ID at least twice
                // This eliminates "glitch" false positives on random textures.
                const currentMatches = { ...(matchConsensus.current || {}) };
                currentMatches[anchorId] = (currentMatches[anchorId] || 0) + 1;
                matchConsensus.current = currentMatches;

                // --- Phase 4: Production Feedback Badges ---
                const conf = frameJson.confidence || 0;
                const live = frameJson.liveness?.is_liveness_passing;
                const focus = frameJson.focus_score || 0;
                const spread = (frameJson.confidence > 0.5); // Heuristic for distribution

                let newStatus = 'Verifying stability...';
                if (!live) newStatus = '⚠️ Anti-Spoof: Screen detected?';
                else if (focus < 40) newStatus = '📸 Image blurry - hold still';
                else if (conf > 0.8) newStatus = '✅ High Confidence Match';
                else if (currentMatches[anchorId] === 1) newStatus = '🔍 Building Consensus...';

                setStatusMsg(newStatus);
                setMatchDetails({
                  confidence: conf,
                  liveness: live,
                  distribution: spread,
                  focus: focus > 40,
                  consensus: currentMatches[anchorId]
                });
                
                if (currentMatches[anchorId] >= 2 && live && conf > 0.4) {
                  console.log('[VerifierScanner] ALL CHECKS PASSED. Finalizing.');
                  safeHaptics.notification(NotificationFeedbackType.Success);
                }
              } else if (typeof frameJson?.detail === 'string' && frameJson.detail.toLowerCase().includes('lighting')) {
                setStatusMsg('Improve lighting and keep the document flat.');
              }
            }

            lastMatchTime.current = Date.now();
          } else if (Date.now() - lastMatchTime.current > 3000) {
            setMatchData(null);
            setMatchCorners(null);
            matchConsensus.current = {}; // Reset consensus on lost tracking
            frameProbeEvery.current += 1;
            if (frameProbeEvery.current % 2 === 0) {
              // Probe scan quality periodically to provide actionable feedback.
              const frameProbe = await apiClient.fetchWithAuth('/signatures/verify-frame', {
                method: 'POST',
                body: JSON.stringify({ image_base64: normalized.base64 }),
              });
              if (frameProbe.ok) {
                const probe = await frameProbe.json();
                if (probe?.match_found && Array.isArray(probe?.corners) && probe.corners.length === 4) {
                  console.log('[VerifierScanner] FRAME MATCH FOUND (probe path):', probe?.metadata?.signer_name);
                  setMatchData(probe.metadata);
                  setMatchCorners(probe.corners);
                  lastMatchTime.current = Date.now();
                  safeHaptics.notification(NotificationFeedbackType.Success);
                } else if (typeof probe?.detail === 'string' && probe.detail.toLowerCase().includes('lighting')) {
                  setStatusMsg('Low scan quality detected. Increase light and hold still.');
                } else {
                  setStatusMsg('Position document inside the frame');
                }
              }
            }
          }
        }
      } catch (err) {
        console.log('[VerifierScanner] Discovery attempt failed (expected on noise)');
      } finally {
        isProcessing.current = false;
      }
      
      setSearchTimer(prev => prev + 1.5);
    }, 1500);

    return () => clearInterval(intervalId);
  }, [isFocused, verifying, isExiting, matchData, showManualInput, viewfinderSize]);

  /** Fallback: Show Manual Override button after 5s of searching */
  const shouldShowManualBtn = useMemo(() => !matchData && !verifying, [matchData, verifying]);

  const resetFlow = useCallback(() => {
    console.log('[VerifierScanner] Resetting flow');
    setMatchData(null);
    setMatchCorners(null);
    setSearchTimer(0);
    setVerifying(false);
    setStatusMsg('Position document inside the frame');
    hasNavigatedToResults.current = false;
    recentVHashesRef.current = [];
    matchConsensus.current = {};
  }, []);

  React.useEffect(() => {
    if (!matchData || hasNavigatedToResults.current) return;
    
    // Only navigate if consensus is reached
    const anchorId = matchData.anchor_id;
    if (matchConsensus.current[anchorId] < 2) return;

    hasNavigatedToResults.current = true;
    navigation.replace('VerificationResults', {
      isValid: true,
      timestamp: matchData.timestamp,
      signerName: matchData.signer_name,
      signerPhone: matchData.signer_phone,
      participants: matchData.all_signer_names || matchData.participants || [],
      referenceId: matchData.reference_id,
      distance: matchData.distance,
      anchorId: matchData.anchor_id,
      cryptographicVerification: matchData.cryptographic_verification,
    });
  }, [matchData, navigation]);

  const handleBack = useCallback(() => {
    console.log('[VerifierScanner] Back button pressed: Cutting camera session...');
    setIsExiting(true);
    navigation.goBack();
  }, [navigation]);

  /** Manual Lookup Logic */
  const handleManualLookup = useCallback(async (refId: string) => {
    try {
      setVerifying(true);
      setStatusMsg('Manual Discovery: searching ledger for code...');
      
      const response = await apiClient.fetchWithAuth(`/signatures/reference/${refId}`);
      if (!response.ok) {
        setVerifying(false);
        Alert.alert('Not Found', 'The Reference ID provided does not match any signed document.');
        return;
      }
      
      const result = await response.json();
      setVerifying(false);
      
      navigation.replace('VerificationResults', { 
        isValid: true,
        timestamp: result.timestamp,
        signerName: result.signer_name,
        referenceId: result.reference_id
      });
    } catch (error) {
      setVerifying(false);
      Alert.alert('Error', 'Manual verification failed.');
    }
  }, [navigation]);

  /** Manual Capture (Triggered by shutter button) */
  const handleVerifyCapture = useCallback(async () => {
    console.log('[VerifierScanner] Initiating Manual Document Verification...');
    if (!cameraRef.current || verifying || isExiting) return;
    
    try {
      setVerifying(true);
      setStatusMsg('Vision Pipeline: Normalizing physical document...');
      
      
      const photo = await cameraRef.current.takePhoto({ enableShutterSound: false });
      if (!photo?.path) throw new Error('Failed to capture document data');

      const normalized = await imageProcessingService.normalizeForVerifier(
        `file://${photo.path}`,
        viewfinderSize,
        cameraContainerSize,
        'camera'
      );
      
      const vHash = imageProcessingService.computeVHashFromBase64(normalized.base64);
      
      // Search Backend for Match
      const response = await apiClient.fetchWithAuth(`/signatures/search?hash=${vHash}`);
      if (!response.ok) {
        setVerifying(false);
        Alert.alert('Not Found', 'This document is not registered on the ledger.');
        return;
      }

      const result = await response.json();
      if (!result.match) {
        setVerifying(false);
        Alert.alert('No Match', 'Visual fingerprint did not match any signed record.');
        return;
      }

      navigation.replace('VerificationResults', { 
        isValid: true,
        timestamp: result.timestamp,
        signerName: result.signer_name,
        referenceId: result.reference_id
      });

    } catch (error: any) {
      console.error('[VerifierScanner] Error:', error);
      Alert.alert('Verification Failed', error.message || 'Unknown error');
      resetFlow();
    }
  }, [verifying, isExiting, navigation, resetFlow]);

  /** Unified Verification Pipeline (for Gallery Uploads) */
  const processDocumentVerification = useCallback(async (imageUri: string) => {
    try {
      setVerifying(true);
      setStatusMsg('Vision Pipeline: Normalizing document...');
      
      const normalized = await imageProcessingService.normalizeForVerifier(
        imageUri,
        viewfinderSize,
        cameraContainerSize,
        'gallery'
      );
      
      const vHash = imageProcessingService.computeVHashFromBase64(normalized.base64);
      setStatusMsg('Building digital consensus...');

      // backend check 1: vHash
      const vhashRes = await apiClient.fetchWithAuth('/signatures/verify-vhash', {
        method: 'POST',
        body: JSON.stringify({ v_hashes: [vHash] }),
      });

      if (!vhashRes.ok) throw new Error('Document not found in ledger');
      const vResult = await vhashRes.json();
      if (!vResult.match_found) throw new Error('No visual matches found');

      const anchorData = vResult.metadata;
      setStatusMsg('Finalizing forensic audit...');

      // backend check 2: high-fidelity Frame Match
      const frameRes = await apiClient.fetchWithAuth('/signatures/verify-frame', {
        method: 'POST',
        body: JSON.stringify({ image_base64: normalized.base64 }),
      });

      if (frameRes.ok) {
        const frameJson = await frameRes.json();
        if (frameJson.match_found) {
           navigation.replace('VerificationResults', {
            isValid: true,
            timestamp: anchorData.timestamp,
            signerName: anchorData.signer_name,
            signerPhone: anchorData.signer_phone,
            participants: anchorData.all_signer_names || anchorData.participants || [],
            referenceId: anchorData.reference_id,
            distance: anchorData.distance,
            anchorId: anchorData.anchor_id,
            cryptographicVerification: anchorData.cryptographic_verification,
          });
          return;
        }
      }
      
      throw new Error('Forensic validation failed. Ensure document is flat and clear.');

    } catch (error: any) {
      setVerifying(false);
      Alert.alert('Verification Failed', error.message || 'Unknown error');
      resetFlow();
    }
  }, [viewfinderSize, navigation, resetFlow]);

  /** Open Library and Verify */
  const handleImagePick = useCallback(async () => {
    if (verifying || isExiting) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        await processDocumentVerification(result.assets[0].uri);
      }
    } catch (error: any) {
      Alert.alert('Library Error', 'Could not open photo library.');
    }
  }, [verifying, isExiting, processDocumentVerification]);

  if (!device) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Optimized Header (Higher Z-Index) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SignVerify</Text>
        
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

      <View 
        style={styles.cameraBackground}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          console.log(`[VerifierScanner] Camera container layout: ${width}x${height}`);
          setCameraContainerSize({ width, height });
        }}
      >
        {/* Forensic Status Badges */}
        {matchData && matchDetails && (
          <View style={styles.forensicContainer}>
            <View style={styles.forensicRow}>
              <View style={[styles.statusDot, { backgroundColor: matchDetails.liveness ? '#4CAF50' : '#F44336' }]} />
              <Text style={styles.forensicText}>LIVENESS: {matchDetails.liveness ? 'VALIDATED' : 'SPOOF DETECTED'}</Text>
            </View>
            <View style={styles.forensicRow}>
              <View style={[styles.statusDot, { backgroundColor: matchDetails.distribution ? '#4CAF50' : '#FF9800' }]} />
              <Text style={styles.forensicText}>GEOMETRY: {matchDetails.distribution ? 'STABLE' : 'CLUSTERING'}</Text>
            </View>
            <View style={styles.forensicRow}>
              <View style={[styles.statusDot, { backgroundColor: matchDetails.focus ? '#4CAF50' : '#FFC107' }]} />
              <Text style={styles.forensicText}>FOCUS: {matchDetails.focus ? 'CLEAR' : 'BLURRY'}</Text>
            </View>
            <View style={styles.forensicRow}>
              <View style={[styles.statusDot, { backgroundColor: matchDetails.consensus >= 2 ? '#4CAF50' : '#2196F3' }]} />
              <Text style={styles.forensicText}>CONSENSUS: {matchDetails.consensus}/2</Text>
            </View>
          </View>
        )}

        {/* Actionable Hint */}
        {statusMsg && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        )}
        {verifying ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.secondary} />
            <Text style={styles.loadingTitle}>{statusMsg}</Text>
            <Text style={styles.loadingSubtitle}>Performing multi-layered visual and semantic cross-checks.</Text>
          </View>
        ) : (
          <>
            <Camera 
              style={StyleSheet.absoluteFillObject} 
              ref={cameraRef} 
              device={device}
              isActive={isFocused && !isExiting && !!hasPermission}
              photo={true}
              torch={flashOn ? 'on' : 'off'}
            />

            {/* Viewfinder Overlay (same interactive, resizable window as Scanner) */}
            <ScannerOverlay
              stepLabel={matchData ? 'DOCUMENT IDENTIFIED' : 'SEARCHING FOR DOCUMENT...'}
              stepNumber={matchData ? 2 : 1}
              totalSteps={2}
              feedbackBadges={matchData ?
                [{ label: `Match: ${matchData.signer_name}`, variant: 'success' }] :
                [{ label: 'Always-On Visual Search Active', variant: 'info' }]}
              scanning={!verifying && !isExiting && !matchData}
              statusMsg={statusMsg}
              onFrameChange={setViewfinderSize}
            />

            {/* Manual Override Trigger */}
            {shouldShowManualBtn && (
              <TouchableOpacity 
                style={styles.manualBtn} 
                onPress={() => setShowManualInput(true)}
              >
                <MaterialIcons name="keyboard" size={20} color="#FFF" />
                <Text style={styles.manualBtnText}>Manual Code Entry</Text>
              </TouchableOpacity>
            )}

            {/* AR Projection Layer */}
            {matchCorners && matchData && (
              <ARProjectionOverlay 
                corners={matchCorners}
                frameWidth={frameInfo.width || 1024}
                frameHeight={frameInfo.height || 1024}
                metadata={matchData}
              />
            )}

            {/* Premium Controls */}
            <View style={styles.bottomControls}>
              <View style={{ width: 48 }} />

              <TouchableOpacity
                style={[styles.captureBtn, (isExiting) && { opacity: 0.3 }]}
                onPress={handleVerifyCapture}
                disabled={isExiting}
              >
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlBtn} onPress={handleImagePick}>
                <MaterialIcons name="photo-library" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Manual Entry Modal */}
      <Modal
        visible={showManualInput}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowManualInput(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manual Verification</Text>
              <TouchableOpacity onPress={() => setShowManualInput(false)}>
                <MaterialIcons name="close" size={24} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalLabel}>Enter 6-digit Reference ID</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. AB4X90"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="characters"
              maxLength={6}
              onChangeText={(text) => {
                if (text.length === 6) {
                  setShowManualInput(false);
                  handleManualLookup(text);
                }
              }}
            />
            <Text style={styles.modalHint}>Case-insensitive. Uses Western alphanumeric characters only.</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    zIndex: 20,
  },
  loadingTitle: {
    ...Typography.headlineSmall,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  loadingSubtitle: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
  },
  forensicContainer: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 100,
  },
  forensicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  forensicText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
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
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    ...Typography.titleLarge,
    color: '#FFF',
  },
  modalLabel: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.sm,
  },
  manualInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    height: 56,
    paddingHorizontal: Spacing.md,
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  modalHint: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.4)',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  manualBtn: {
    position: 'absolute',
    bottom: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    gap: Spacing.sm,
  },
  manualBtnText: {
    ...Typography.labelMedium,
    color: '#FFF',
  },
  arMatchCard: {
    position: 'absolute',
    top: '40%',
    left: Spacing.xl,
    right: Spacing.xl,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  arSeal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  arDetails: {
    flex: 1,
  },
  arTitle: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  arSigner: {
    ...Typography.titleSmall,
    color: '#FFF',
  },
  arRef: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.4)',
  },
  arAction: {
    backgroundColor: Colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    gap: 4,
  },
  arActionText: {
    ...Typography.labelSmall,
    color: Colors.onSecondary,
    fontWeight: '700',
  },
});
