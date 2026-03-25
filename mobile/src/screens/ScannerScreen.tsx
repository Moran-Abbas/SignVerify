/**
 * ScannerScreen
 *
 * Flow: idle → processing → preview (user confirms) → signing → success
 *
 * Only one document can be in flight at a time. The user must explicitly
 * confirm the scanned image before biometrics are requested. "Retake Photo"
 * fully resets to idle without going to the network.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Alert, Image, ScrollView, ActivityIndicator,
} from 'react-native';
import { safeHaptics, NotificationFeedbackType } from '../utils/nativeUtils';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';

import { BiometricPrompt, SecurityChip } from '../components';
import { Colors, Spacing, Radius, Typography } from '../theme';

import { imageProcessingService } from '../services/imageProcessingService';
import { anchorService } from '../services/anchorService';
import { hashService } from '../services/hashService';
import { keyManager } from '../services/keyManager';
import { ocrService } from '../services/ocrService';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { documentScannerService } from '../services/documentScannerService';
import { imageQualityService, QualityHint } from '../services/imageQualityService';
import { normalizeDocumentText, NO_TEXT_COMMITMENT_SENTINEL } from '../utils/textNormalize';
import { ScannerOverlay } from '../components';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SIGNING_POLICY_VERSION = 2;
const OCR_TIMEOUT_MS = 12000;

type Phase = 'idle' | 'processing' | 'preview' | 'signing';

export default function ScannerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('Tap to scan a document');
  const [showBiometric, setShowBiometric] = useState(false);
  const [qualityHints, setQualityHints] = useState<QualityHint[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // Payload refs — avoids stale-closure issues across async callbacks
  const pendingImageBase64 = useRef<string | null>(null);
  const pendingHash = useRef<string | null>(null);
  const pendingReferenceId = useRef<string | null>(null);
  const pendingTextHash = useRef<string | null>(null);

  // ── Step 1: Scan & process ────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);

  // Frame size for the manual crop
  const [frameSize, setFrameSize] = useState({ width: 320, height: 450 });

  // ── Step 1: Capture & process ─────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || phase !== 'idle') return;

    try {
      setPhase('processing');
      setStatusMsg('Capturing document...');

      const photo = await cameraRef.current.takePhoto({
        enableShutterSound: true,
      });
      
      // Fix: Ensure URI is correctly formatted (avoid file://file://)
      const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      console.log(`[Scanner] Photo captured: ${uri} (${photo.width}x${photo.height})`);

      // ── Step 1: Normalize & Get Info ──
      // Some photos have EXIF rotation. We normalize first to ensure we work with 
      // the actual pixel orientation the user is seeing.
      console.log('[Scanner] Normalizing photo EXIF...');
      const normalized = await ImageManipulator.manipulateAsync(uri, []);
      const imgW = normalized.width;
      const imgH = normalized.height;
      let workingUri = normalized.uri;

      // ── Step 2: Handle Orientation Mismatch ──
      // VisionCamera 'absoluteFill' centers the sensor. We need to find the scale.
      const sensorRatio = imgW / imgH;
      const screenRatio = SCREEN_WIDTH / SCREEN_HEIGHT;

      let scale: number;
      let offsetX = 0;
      let offsetY = 0;

      // We assume the camera view occupies the full screen.
      // If sensor is MORE LANDSCAPE than the screen (typical for Portrait holding)
      if (sensorRatio > screenRatio) {
        // Sensor is wider (horizontally) than the screen's vertical proportion
        // Height matches screen height, width is overscanned
        scale = imgH / SCREEN_HEIGHT;
        offsetX = (imgW - SCREEN_WIDTH * scale) / 2;
      } else {
        // Sensor is taller than the screen's proportion
        scale = imgW / SCREEN_WIDTH;
        offsetY = (imgH - SCREEN_HEIGHT * scale) / 2;
      }

      // Calculate origin relative to the top-left of the ACTUAL VISIBLE pixels
      const originX = Math.floor(offsetX + ((SCREEN_WIDTH - frameSize.width) / 2) * scale);
      const originY = Math.floor(offsetY + ((SCREEN_HEIGHT - frameSize.height) / 2) * scale);
      const width = Math.floor(frameSize.width * scale);
      const height = Math.floor(frameSize.height * scale);

      const cropRect = {
        originX: Math.max(0, originX),
        originY: Math.max(0, originY),
        width: Math.min(width, imgW - originX),
        height: Math.min(height, imgH - originY),
      };

      console.log(`[Scanner] Final Precision Crop: ${JSON.stringify(cropRect)} on ${imgW}x${imgH}`);
      
      setStatusMsg('Cropping & assessing quality...');
      const croppedUri = await imageProcessingService.cropImage(workingUri, cropRect);
      setPreviewUri(croppedUri);

      const hints = await imageQualityService.checkQualityHints(croppedUri);
      setQualityHints(hints);

      const filePath = croppedUri.replace(/^file:\/\//, '');
      const ocrRaw = await Promise.race([
        ocrService.extractTextFromImage(filePath),
        new Promise<string>((_, rej) =>
          setTimeout(() => rej(new Error('ocr_timeout')), OCR_TIMEOUT_MS)
        ),
      ]).catch(() => '');

      const nt = normalizeDocumentText(typeof ocrRaw === 'string' ? ocrRaw : '');
      const textForCommit = nt.length > 0 ? nt : NO_TEXT_COMMITMENT_SENTINEL;
      pendingTextHash.current = await hashService.hashText(textForCommit);

      setStatusMsg('Normalizing for blockchain...');
      const { base64 } = await imageProcessingService.normalizeToBindingSpec(croppedUri);
      pendingImageBase64.current = base64;
      pendingHash.current = await hashService.hashText(base64);
      pendingReferenceId.current = imageProcessingService.generateShortcode();

      setPhase('preview');
      setStatusMsg('Review your document, then tap Sign to proceed.');
      safeHaptics.notification(NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('[Scanner] Manual capture failed:', error);
      Alert.alert('Capture Error', error.message || 'Failed to capture document');
      setPhase('idle');
    }
  }, [phase, frameSize]);

  // Compatibility wrapper (if still used)
  const handleScan = handleCapture;

  // ── Step 2a: User confirms → trigger biometric ───────────────────────────
  const handleSignNow = useCallback(() => {
    if (phase !== 'preview') return;
    if (!pendingImageBase64.current || !pendingHash.current) return;
    setShowBiometric(true);
  }, [phase]);

  // ── Step 2b: User wants to retake → full reset ───────────────────────────
  const handleRetake = useCallback(() => {
    pendingImageBase64.current = null;
    pendingHash.current = null;
    pendingReferenceId.current = null;
    pendingTextHash.current = null;
    setPreviewUri(null);
    setQualityHints([]);
    setPhase('idle');
    setStatusMsg('Tap to scan a document');
  }, []);

  // ── Step 3: Biometric approved → sign & upload ───────────────────────────
  const handleBiometricConfirm = useCallback(async () => {
    console.log('[Scanner] Biometric confirmed, signing Policy v2 payload...');
    setShowBiometric(false);
    setPhase('signing');
    setStatusMsg('Hardware Enclave: signing document binding...');

    try {
      if (!pendingHash.current || !pendingImageBase64.current || !pendingTextHash.current) {
        throw new Error('No document context to sign');
      }

      const payloadObj = {
        policy_version: SIGNING_POLICY_VERSION,
        document_hash: pendingHash.current,
        text_hash: pendingTextHash.current,
        ts: Date.now(),
        transaction_uuid: uuidv4(),
      };
      const payloadStr = JSON.stringify(payloadObj);

      console.log('[Scanner] V2 Signing payload:', payloadStr);
      const signature = await keyManager.signHash(payloadStr);

      setStatusMsg('Signing your document...');
      const anchorData = await anchorService.uploadDigitalAnchor(
        pendingImageBase64.current,
        signature,
        undefined,
        undefined,
        payloadStr,
        payloadObj.transaction_uuid,
        undefined,
        pendingReferenceId.current || undefined
      );

      safeHaptics.notification(NotificationFeedbackType.Success);
      navigation.replace('SigningSuccess', {
        payload: anchorData.payload,
        referenceId: pendingReferenceId.current,
      });
    } catch (error: any) {
      const isTimeout =
        error?.name === 'AbortError' ||
        String(error?.message || '').toLowerCase().includes('aborted');

      let errorMsg = 'Unknown signing error';
      let title = 'Cryptographic Binding Failed';
      let isValidationFailure = false;

      const detail = error.response?.data?.detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (typeof detail === 'object' && detail !== null) {
        errorMsg = detail.message || detail.error || JSON.stringify(detail);
      } else {
        errorMsg = error.message || 'Server connection failed';
      }

      // ── Intelligent Error Mapping ──
      if (errorMsg.includes('IMAGE_QUALITY_REJECTED')) {
        title = 'Image Quality Rejected';
        errorMsg = errorMsg.replace('IMAGE_QUALITY_REJECTED: ', '');
        isValidationFailure = true;
      } else if (errorMsg.includes('DOCUMENT_NOT_DETECTED')) {
        title = 'Document Not Detected';
        errorMsg = errorMsg.replace('DOCUMENT_NOT_DETECTED: ', '');
        isValidationFailure = true;
      } else if (errorMsg.includes('REPLAY_ATTACK')) {
        title = 'Security Protocol Violation';
      }

      // Only console.error if it's a real system failure or timeout
      if (isValidationFailure) {
        console.log(`[Scanner] Validation rejection: ${errorMsg}`);
      } else {
        console.error('[Scanner] Signing/Upload error:', error);
      }

      if (isTimeout) {
        errorMsg = 'Upload timed out. Check your connection and try again.';
      }

      Alert.alert(title, errorMsg);
      
      // Return to preview so user can retry without rescanning
      setPhase('preview');
      setStatusMsg('Signing failed. Adjust the document or light and retry.');
    }
  }, [navigation]);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
        <SecurityChip variant="verified" label="ENCLAVE ACTIVE" />
        <View style={{ width: 44 }} />
      </View>

      {/* ── IDLE / LIVE CAMERA ─────────────────────────────────────────── */}
      {phase === 'idle' && (
        <View style={StyleSheet.absoluteFill}>
          {hasPermission && !!device ? (
            <>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={isFocused}
                photo={true}
                ref={cameraRef}
              />
              <ScannerOverlay
                statusMsg="Align document within the frame and resize if needed"
                onFrameChange={setFrameSize}
                scanning={false}
              />
              
              {/* Manual Shutter Button */}
              <View style={styles.shutterContainer}>
                <TouchableOpacity style={styles.shutterBtn} onPress={handleCapture}>
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
                <Text style={styles.shutterHint}>Tap to capture</Text>
              </View>
            </>
          ) : (
            <View style={styles.centerContent}>
               <ActivityIndicator size="large" color="#FFF" />
               <Text style={[styles.statusText, { marginTop: 20 }]}>Initializing camera...</Text>
               {!hasPermission && (
                 <TouchableOpacity style={styles.launchBtn} onPress={requestPermission}>
                   <Text style={styles.launchBtnText}>Grant Permission</Text>
                 </TouchableOpacity>
               )}
            </View>
          )}
        </View>
      )}

      {/* ── PROCESSING ───────────────────────────────────────────────────── */}
      {phase === 'processing' && (
        <View style={styles.centerContent}>
          <ActivityIndicator
            size="large"
            color={Colors.onPrimary}
            style={{ marginBottom: Spacing.xl }}
          />
          <Text style={styles.statusTitle}>Processing…</Text>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      )}

      {/* ── PREVIEW + SIGNING ─────────────────────────────────────────────
          Both phases share this view. Buttons are hidden during signing.     */}
      {(phase === 'preview' || phase === 'signing') && !!previewUri && (
        <ScrollView
          contentContainerStyle={styles.previewScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewCard}>
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          </View>
          
          {phase !== 'signing' && (
            <Text style={styles.statusText}>{statusMsg}</Text>
          )}

          {qualityHints.length > 0 && phase !== 'signing' && (
            <View style={styles.hintsBox}>
              {qualityHints.map((hint, i) => (
                <View key={i} style={styles.hintItem}>
                  <MaterialIcons name="warning" size={16} color={Colors.warning} />
                  <Text style={styles.hintText}>{hint.message}</Text>
                </View>
              ))}
            </View>
          )}

          {phase === 'preview' && (
            <>
              <TouchableOpacity style={styles.signBtn} onPress={handleSignNow}>
                <MaterialIcons name="fingerprint" size={22} color={Colors.primary} />
                <Text style={styles.signBtnText}>Sign This Document</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
                <MaterialIcons name="refresh" size={20} color={Colors.onPrimary} />
                <Text style={styles.retakeBtnText}>Retake Photo</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'signing' && (
            <View style={styles.signingRow}>
              <ActivityIndicator size="small" color={Colors.onPrimary} />
              <Text style={styles.signingText}>Signing your document...</Text>
            </View>
          )}
        </ScrollView>
      )}

      <BiometricPrompt
        visible={showBiometric}
        onConfirm={handleBiometricConfirm}
        onCancel={() => {
          setShowBiometric(false);
          setPhase('preview');
          setStatusMsg('Review your document, then tap Sign to proceed.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  topActions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    zIndex: 100,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  scannerIconBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  statusTitle: {
    ...Typography.headlineSmall,
    color: '#FFF',
    marginBottom: Spacing.xs,
  },
  statusText: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  launchBtn: {
    backgroundColor: '#FFF',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
  },
  launchBtnText: {
    ...Typography.titleMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  // Preview
  previewScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 100,
    paddingBottom: 100,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  previewCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  previewImage: { width: '100%', height: 380 },
  hintsBox: {
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderColor: 'rgba(255,180,0,0.3)',
    borderWidth: 1,
    padding: Spacing.md,
    borderRadius: Radius.md,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  hintText: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  signBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    width: '100%',
    marginBottom: Spacing.md,
  },
  signBtnText: {
    ...Typography.titleMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    width: '100%',
  },
  retakeBtnText: {
    ...Typography.titleMedium,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  signingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  signingText: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    alignItems: 'center',
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  shutterHint: {
    ...Typography.labelMedium,
    color: '#FFF',
    marginTop: Spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
