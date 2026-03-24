/**
 * ScannerScreen
 *
 * Orchestrates:
 * 1. Camera Capture & Image Upload
 * 2. Analog Hole Bridge: Secure Image Normalization & Hashing
 * 3. Biometric Signing (Secure Enclave / Simulator Mock)
 * 4. Backend Anchor Transmission
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Dimensions } from 'react-native';
import { safeHaptics, ImpactFeedbackStyle, NotificationFeedbackType } from '../utils/nativeUtils';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraPermission, useCameraFormat } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';

import { ScannerOverlay, BiometricPrompt, SecurityChip } from '../components';
import { Colors, Spacing, Radius, Typography } from '../theme';

import { imageProcessingService } from '../services/imageProcessingService';
import { anchorService } from '../services/anchorService';
import { hashService } from '../services/hashService';
import { keyManager } from '../services/keyManager';
import { ocrService } from '../services/ocrService';
import { normalizeDocumentText, NO_TEXT_COMMITMENT_SENTINEL } from '../utils/textNormalize';

const SIGNING_POLICY_VERSION = 1;
const OCR_TIMEOUT_MS = 12000;

export default function ScannerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  // 2026 Optimization: Find a format that supports high-resolution photo capture
  const format = useCameraFormat(device, [
    { photoResolution: 'max' },
    { videoResolution: 'max' }
  ]);

  const [scanning, setScanning] = useState(false);
  const [isExiting, setIsExiting] = useState(false); // 2026 Perf Fix: Deactivate camera instantly on back
  const [statusMsg, setStatusMsg] = useState('Position document inside frame');
  const [showBiometric, setShowBiometric] = useState(false);
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [pendingVHash, setPendingVHash] = useState<string | null>(null);
  const [pendingPHash, setPendingPHash] = useState<string | null>(null);
  const [pendingReferenceId, setPendingReferenceId] = useState<string | null>(null);
  const [pendingTextHash, setPendingTextHash] = useState<string | null>(null);
  const [viewfinderSize, setViewfinderSize] = useState({ width: 320, height: 240 });
  const [flashOn, setFlashOn] = useState(false);
  const [cameraContainerSize, setCameraContainerSize] = useState({ width: Dimensions.get('window').width, height: Dimensions.get('window').height });
  
  const cameraRef = useRef<Camera>(null);

  // Handle Permissions
  if (!hasPermission) {
    requestPermission();
    return <View style={styles.container} />;
  }

  /**
   * Universal Anchor Processor
   * Handles both file paths (camera/library) and direct Base64 (simulated)
   */
  const processImage = useCallback(async (imageSource: string) => {
    try {
      setScanning(true);

      setStatusMsg('Vision Pipeline: Normalizing document and extracting text…');
      console.log('[Scanner] ImageProcessingService starting...');

      const screen = { width: Dimensions.get('window').width, height: Dimensions.get('window').height };
      const hasUriScheme = /^(file|content|ph|assets-library):/.test(imageSource) || imageSource.startsWith('/');
      const isRawBase64Mock =
        !hasUriScheme &&
        !imageSource.startsWith('data:') &&
        imageSource.length < 800 &&
        /^[A-Za-z0-9+/=]+$/.test(imageSource.replace(/\s/g, ''));

      let base64: string;
      let vHash: string;

      if (isRawBase64Mock) {
        const dataUri = `data:image/png;base64,${imageSource}`;
        const r = await ImageManipulator.manipulateAsync(
          dataUri,
          [{ resize: { width: 1024, height: 1024 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!r.base64) throw new Error('Simulator image encode failed');
        base64 = r.base64;
        vHash = imageProcessingService.computeVisualFingerprintFromBase64(base64);
        const text_hash = await hashService.hashText(NO_TEXT_COMMITMENT_SENTINEL);
        setPendingTextHash(text_hash);
      } else {
        const normPromise = imageProcessingService.normalizeToBindingSpec(
          imageSource,
          viewfinderSize,
          cameraContainerSize,
          isRawBase64Mock ? 'camera' : (hasUriScheme ? 'camera' : 'gallery')
        );

        const filePath = imageSource.startsWith('file://')
          ? imageSource.replace(/^file:\/\//, '')
          : imageSource.startsWith('file:')
            ? imageSource.replace(/^file:/, '')
            : '';

        const ocrPromise =
          filePath.length > 0
            ? Promise.race([
                ocrService.extractTextFromImage(filePath),
                new Promise<string>((_, rej) =>
                  setTimeout(() => rej(new Error('ocr_timeout')), OCR_TIMEOUT_MS)
                ),
              ]).catch(() => '')
            : Promise.resolve('');

        const [result, ocrRaw] = await Promise.all([normPromise, ocrPromise]);
        base64 = result.base64;
        vHash = result.vHash;

        const nt = normalizeDocumentText(typeof ocrRaw === 'string' ? ocrRaw : '');
        const textForCommit = nt.length > 0 ? nt : NO_TEXT_COMMITMENT_SENTINEL;
        const text_hash = await hashService.hashText(textForCommit);
        setPendingTextHash(text_hash);
      }

      setPendingImageBase64(base64);
      setPendingVHash(vHash);

      setStatusMsg('Vision Engine: calculating visual identity...');
      const phash = vHash;
      const refId = imageProcessingService.generateShortcode();
      setPendingPHash(phash);
      setPendingReferenceId(refId);

      setStatusMsg('Calculating cryptographic identity...');
      const docHash = await hashService.hashText(base64);
      setPendingHash(docHash);

      console.log('[Scanner] Document bound with vHash:', vHash);
      setShowBiometric(true);
    } catch (error: any) {
      console.log('[Scanner] Process error:', error.message);
      Alert.alert('Normalization Failed', error.message);
      setScanning(false);
      setStatusMsg('Position document inside frame');
    }
  }, [viewfinderSize]);

  /** Capture photo directly from Vision Camera */
  const handleCapture = useCallback(async () => {
    console.log('[Scanner] Capture button pressed');
    if (!cameraRef.current || scanning || isExiting) return;
    
    try {
      // Shutter haptic silenced per user request
      setStatusMsg('Capturing image...');
      const photo = await cameraRef.current.takePhoto({ 
        enableShutterSound: true,
        flash: flashOn ? 'on' : 'off',
        // Note: Quality is managed via the 'format' prop in V4
      });
      if (!photo?.path) throw new Error('Failed to capture image data');
      
      await processImage(`file://${photo.path}`);
    } catch (error: any) {
      Alert.alert('Capture Failed', error.message);
      setStatusMsg('Position document inside frame');
    }
  }, [flashOn, scanning, isExiting, processImage]);

  /** Open native image picker to upload file */
  const handleImagePick = useCallback(async () => {
    if (scanning || isExiting) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, 
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        await processImage(result.assets[0].uri);
      }
    } catch (error: any) {
      Alert.alert('Library Error', 'Could not open photo library.');
    }
  }, [scanning, isExiting, processImage]);

  /** Finalize Cryptographic Signing Sequence & S3 Upload */
  const handleBiometricConfirm = useCallback(async () => {
    console.log('[Scanner] Biometric confirmed, signing binding payload...');
    setShowBiometric(false);
    setStatusMsg('Hardware Enclave: signing binding payload...');
    
    try {
      if (!pendingHash || !pendingImageBase64 || !pendingVHash || !pendingTextHash) {
        throw new Error('No constrained document context to sign');
      }

      const payloadObj = {
        policy_version: SIGNING_POLICY_VERSION,
        v_hash: pendingVHash,
        document_hash: pendingHash,
        text_hash: pendingTextHash,
        ts: Date.now(),
        transaction_uuid: uuidv4(),
      };
      const payloadStr = JSON.stringify(payloadObj);
      
      console.log('[Scanner] Signing payload:', payloadStr);
      const signature = await keyManager.signHash(payloadStr); 
      
      setStatusMsg('Zero-Trust Commitment: Uploading to ledger...');
      const anchorData = await anchorService.uploadDigitalAnchor(
        pendingImageBase64, 
        signature,
        pendingVHash,
        undefined, 
        payloadStr,
        payloadObj.transaction_uuid,
        pendingPHash || undefined,
        pendingReferenceId || undefined
      );
      
      setScanning(false);
      safeHaptics.notification(NotificationFeedbackType.Success);
      navigation.replace('SigningSuccess', { 
        payload: anchorData.payload,
        phash: pendingPHash,
        referenceId: pendingReferenceId
      });

    } catch (error: any) {
      console.error('[Scanner] Signing/Upload error:', error);
      const isTimeout = (error?.name === 'AbortError') || String(error?.message || '').toLowerCase().includes('aborted');
      const errorMsg = isTimeout
        ? 'Upload timed out. Check connection and try again.'
        : (error.response?.data?.detail || error.message || 'Unknown signing error');
      Alert.alert('Cryptographic Binding Failed', errorMsg);
      setScanning(false);
      setStatusMsg('Position document inside frame');
    }
  }, [pendingHash, pendingImageBase64, pendingVHash, pendingTextHash, navigation]);

  const handleBack = useCallback(() => {
    console.log('[Scanner] Back button pressed: Cutting camera session...');
    setIsExiting(true);
    navigation.goBack();
  }, [navigation]);

  // Handle missing camera device (e.g., simulator)
  if (!device) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.simulatorModeBadge}>
          <MaterialIcons name="developer-mode" size={20} color={Colors.onWarningContainer} />
          <Text style={styles.simulatorModeText}>SIMULATOR MODE</Text>
        </View>
        <Text style={[styles.simulatorHint, { color: 'rgba(255,255,255,0.7)', marginBottom: Spacing['2xl'] }]}>
          Physical camera unavailable in simulator.
        </Text>
        <TouchableOpacity 
          style={styles.simulateBtn}
          onPress={async () => {
            console.log('[Scanner] Simulating capture...');
            const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1FSAAAAAElFTkSuQmCC';
            await processImage(mockBase64);
          }}
        >
          <MaterialIcons name="document-scanner" size={32} color={Colors.onSecondary} />
          <Text style={styles.simulateBtnText}>Simulate Capture</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.closeBtn, { position: 'absolute', top: 60, right: 20 }]} 
          onPress={handleBack}
        >
          <MaterialIcons name="close" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View 
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCameraContainerSize({ width, height });
      }}
    >
      <StatusBar barStyle="light-content" />
      <Camera
        style={StyleSheet.absoluteFill}
        ref={cameraRef}
        device={device}
        isActive={isFocused && !isExiting}
        photo={true}
        format={format}
        videoStabilizationMode="auto"
        torch={flashOn ? 'on' : 'off'}
      />

      <ScannerOverlay 
        scanning={scanning && !isExiting} 
        statusMsg={statusMsg} 
        onFrameChange={setViewfinderSize}
      />

      {/* Header Actions */}
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleBack}>
          <MaterialIcons name="close" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
        <SecurityChip variant="verified" label="ENCLAVE ACTIVE" />

        <TouchableOpacity style={styles.iconBtn} onPress={() => setFlashOn(!flashOn)}>
          <MaterialIcons 
            name={flashOn ? "flash-on" : "flash-off"} 
            size={24} 
            color={Colors.onPrimary} 
          />
        </TouchableOpacity>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.secondaryAction} onPress={handleImagePick}>
          <MaterialIcons name="photo-library" size={24} color={Colors.onPrimary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.captureBtn, (scanning || isExiting) && styles.captureBtnDisabled]} 
          onPress={() => {
            if (!scanning && !isExiting) handleCapture();
          }}
          disabled={scanning || isExiting}
        >
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>

        <View style={{ width: 44 }} />
      </View>

      <BiometricPrompt
        visible={showBiometric}
        onConfirm={handleBiometricConfirm}
        onCancel={() => {
          setShowBiometric(false);
          setScanning(false);
          setStatusMsg('Position document inside frame');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topActions: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    zIndex: 30,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
  },
  closeBtn: {
    padding: 10,
  },
  // ── Simulator Styles ──────────────────────────────────
  simulatorModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningContainer,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  simulatorModeText: {
    ...Typography.labelSmall,
    color: Colors.onWarningContainer,
    fontWeight: '700',
    letterSpacing: 1,
  },
  simulatorHint: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  simulateBtn: {
    backgroundColor: Colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  simulateBtnText: {
    ...Typography.titleMedium,
    color: Colors.onSecondary,
  },
});
