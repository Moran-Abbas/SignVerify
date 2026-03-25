/**
 * ScannerScreen
 *
 * Orchestrates:
 * 1. Native Document Scanning (Perspective corrected UI)
 * 2. Mobile Capture Hints (Quality assessment)
 * 3. Biometric Signing (SHA-256 Document_Hash binding - Policy v2)
 * 4. Backend Anchor Transmission
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Dimensions, ScrollView } from 'react-native';
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
import { documentScannerService } from '../services/documentScannerService';
import { imageQualityService, QualityHint } from '../services/imageQualityService';
import { normalizeDocumentText, NO_TEXT_COMMITMENT_SENTINEL } from '../utils/textNormalize';

const SIGNING_POLICY_VERSION = 2; // Upgraded to v2 (deterministic binary hash)
const OCR_TIMEOUT_MS = 12000;

export default function ScannerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  const [scanning, setScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Tap to scan a document');
  const [showBiometric, setShowBiometric] = useState(false);
  const [qualityHints, setQualityHints] = useState<QualityHint[]>([]);
  
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [pendingReferenceId, setPendingReferenceId] = useState<string | null>(null);
  const [pendingTextHash, setPendingTextHash] = useState<string | null>(null);

  /**
   * Launch Native Scanner & Pipeline
   */
  const handleScan = useCallback(async () => {
    if (scanning) return;
    
    try {
      setScanning(true);
      setStatusMsg('Opening native document scanner...');
      
      const imageUri = await documentScannerService.scanDocument();
      if (!imageUri) {
        setScanning(false);
        setStatusMsg('Scan cancelled');
        return;
      }

      setStatusMsg('Vision Pipeline: Assessing quality & extracting text...');
      
      // 1. Quality Hints (Async check)
      const hints = await imageQualityService.checkQualityHints(imageUri);
      setQualityHints(hints);
      
      // 2. OCR (Async check)
      const filePath = imageUri.replace(/^file:\/\//, '');
      const ocrRaw = await Promise.race([
        ocrService.extractTextFromImage(filePath),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error('ocr_timeout')), OCR_TIMEOUT_MS)),
      ]).catch(() => '');

      const nt = normalizeDocumentText(typeof ocrRaw === 'string' ? ocrRaw : '');
      const textForCommit = nt.length > 0 ? nt : NO_TEXT_COMMITMENT_SENTINEL;
      const text_hash = await hashService.hashText(textForCommit);
      setPendingTextHash(text_hash);

      // 3. Normalization (Resize to 1024x1024)
      const { base64 } = await imageProcessingService.normalizeToBindingSpec(imageUri);
      setPendingImageBase64(base64);

      // 4. Policy v2 Hash (SHA-256 of the normalized Base64)
      const docHash = await hashService.hashText(base64);
      setPendingHash(docHash);

      const refId = imageProcessingService.generateShortcode();
      setPendingReferenceId(refId);

      setStatusMsg('Document bound. Ready to sign.');
      setShowBiometric(true);
    } catch (error: any) {
      console.error('[Scanner] Pipeline failed:', error);
      Alert.alert('Scanner Error', error.message || 'Failed to process document');
      setScanning(false);
      setStatusMsg('Tap to scan a document');
    }
  }, [scanning]);

  /**
   * Biometric Signing Sequence (Policy v2)
   */
  const handleBiometricConfirm = useCallback(async () => {
    console.log('[Scanner] Biometric confirmed, signing Policy v2 payload...');
    setShowBiometric(false);
    setStatusMsg('Hardware Enclave: signing document binding...');
    
    try {
      if (!pendingHash || !pendingImageBase64 || !pendingTextHash) {
        throw new Error('No document context to sign');
      }

      // Policy v2: No client-side v_hash
      const payloadObj = {
        policy_version: SIGNING_POLICY_VERSION,
        document_hash: pendingHash,
        text_hash: pendingTextHash,
        ts: Date.now(),
        transaction_uuid: uuidv4(),
      };
      const payloadStr = JSON.stringify(payloadObj);
      
      console.log('[Scanner] V2 Signing payload:', payloadStr);
      const signature = await keyManager.signHash(payloadStr); 
      
      setStatusMsg('Zero-Trust Commitment: Uploading to ledger...');
      const anchorData = await anchorService.uploadDigitalAnchor(
        pendingImageBase64, 
        signature,
        undefined, // vHash omitted in v2 client-side
        undefined, 
        payloadStr,
        payloadObj.transaction_uuid,
        undefined, // phash omitted (calculated on server in T3)
        pendingReferenceId || undefined
      );
      
      setScanning(false);
      safeHaptics.notification(NotificationFeedbackType.Success);
      navigation.replace('SigningSuccess', { 
        payload: anchorData.payload,
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
      setStatusMsg('Tap to scan a document');
    }
  }, [pendingHash, pendingImageBase64, pendingTextHash, pendingReferenceId, navigation]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Actions */}
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleBack}>
          <MaterialIcons name="close" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
        <SecurityChip variant="verified" label="ENCLAVE ACTIVE" />
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.centerContent}>
        <View style={styles.scannerIconBox}>
          <MaterialIcons name="document-scanner" size={64} color={Colors.primaryContainer} />
        </View>
        <Text style={styles.statusTitle}>Document Scanner</Text>
        {!!statusMsg && (
          <Text style={styles.statusText}>{statusMsg}</Text>
        )}

        {!scanning && (
          <TouchableOpacity style={styles.launchBtn} onPress={handleScan}>
            <Text style={styles.launchBtnText}>Scan Document</Text>
          </TouchableOpacity>
        )}

        {!!scanning && qualityHints.length > 0 && (
          <View style={styles.hintsBox}>
            {qualityHints.map((hint, i) => (
              <View key={i} style={styles.hintItem}>
                <MaterialIcons name="warning" size={16} color={Colors.warning} />
                <Text style={styles.hintText}>{hint.message}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <BiometricPrompt
        visible={showBiometric}
        onConfirm={handleBiometricConfirm}
        onCancel={() => {
          setShowBiometric(false);
          setScanning(false);
          setStatusMsg('Tap to scan a document');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
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
    marginBottom: Spacing['2xl'],
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
  hintsBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.lg,
    borderRadius: Radius.md,
    width: '100%',
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  hintText: {
    ...Typography.bodySmall,
    color: Colors.onWarningContainer,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
