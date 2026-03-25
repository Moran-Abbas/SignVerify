/**
 * ScannerOverlay – Camera frame overlay with OCR feedback badges
 *
 * Design spec from Stitch Scanner & Verifier screens:
 * - Rounded rectangle scan region (center)
 * - Corner markers in green/primary
 * - OCR feedback badges ("Scanning text via OCR...", "TEXT_ANCHOR_FOUND")
 * - Warning badge for poor lighting
 * - Step progress indicator (for verifier flow)
 * - Interactive resizing for user convenience
 */

import React, { useState, useRef, useMemo, memo, useEffect } from 'react';
import { View, Text, StyleSheet, PanResponder, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ScannerOverlayProps {
  /** Current step label (e.g. "SCAN DOCUMENT TEXT") */
  stepLabel?: string;
  /** Current step number */
  stepNumber?: number;
  /** Total steps */
  totalSteps?: number;
  /** Feedback badges to show */
  feedbackBadges?: { label: string; variant: 'info' | 'success' | 'warning' }[];
  /** Whether the scanner is actively processing */
  scanning?: boolean;
  /** Status instruction message */
  statusMsg?: string;
  /** Callback for when the frame size changes (functional resizing) */
  onFrameChange?: (size: { width: number, height: number }) => void;
}

const ScannerOverlay = memo(function ScannerOverlay({
  stepLabel,
  stepNumber,
  totalSteps,
  feedbackBadges = [],
  scanning = false,
  statusMsg,
  onFrameChange,
}: ScannerOverlayProps) {
  // ── Resizable Viewfinder State ────────────────────────────────
  // Defaulting to a larger, more modern 320x240 frame (2026 Spec)
  const [frameSize, setFrameSize] = useState({ width: 320, height: 240 });
  const frameSizeRef = useRef({ width: 320, height: 240 });
  const startSize = useRef({ width: 320, height: 240 });

  // Keep ref in sync for the non-reactive PanResponder closure
  useEffect(() => {
    frameSizeRef.current = frameSize;
    if (onFrameChange) {
      onFrameChange(frameSize);
    }
  }, [frameSize, onFrameChange]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startSize.current = { ...frameSizeRef.current };
        },
        onPanResponderMove: (_, gestureState) => {
          setFrameSize({
            width: Math.max(200, Math.min(SCREEN_WIDTH - 40, startSize.current.width + gestureState.dx)),
            height: Math.max(150, startSize.current.height + gestureState.dy),
          });
        },
      }),
    [] // Stable forever
  );

  return (
    <View style={styles.container}>
      {/* ── Status Message Instruction ────────────────────── */}
      {!!statusMsg && (
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>{statusMsg}</Text>
        </View>
      )}

      {/* Step progress bar */}
      {!!(stepLabel && stepNumber != null && totalSteps != null) && (
        <View style={styles.stepsContainer}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <View
              key={i}
              style={[
                styles.stepDot,
                i + 1 <= stepNumber && styles.stepDotActive,
              ]}
            />
          ))}
          <Text style={styles.stepText}>
            STEP {stepNumber}: {stepLabel}
          </Text>
        </View>
      )}

      {/* ── Scanning Frame (Resizable) ───────────────────── */}
      <View 
        style={[
          styles.scanFrame, 
          { width: frameSize.width, height: frameSize.height }
        ]}
      >
        {/* Corner markers */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        {/* Resize Handle (Bottom-Right) */}
        <View 
          {...panResponder.panHandlers} 
          style={styles.resizeHandle}
        >
          <MaterialIcons name="open-in-full" size={20} color={Colors.secondary} />
        </View>

        {!!scanning && (
          <Text style={styles.scanningText}>Analyzing...</Text>
        )}
      </View>

      {/* Feedback badges */}
      <View style={styles.badgesContainer}>
        {feedbackBadges.map((badge, i) => (
          <View
            key={i}
            style={[
              styles.badge,
              badge.variant === 'success' && styles.badgeSuccess,
              badge.variant === 'warning' && styles.badgeWarning,
              badge.variant === 'info' && styles.badgeInfo,
            ]}
          >
            <MaterialIcons
              name={
                badge.variant === 'warning'
                  ? 'warning'
                  : badge.variant === 'success'
                  ? 'check-circle'
                  : 'info'
              }
              size={14}
              color={
                badge.variant === 'warning'
                  ? Colors.onErrorContainer
                  : badge.variant === 'success'
                  ? Colors.onSecondaryContainer
                  : Colors.onPrimary
              }
              style={styles.badgeIcon}
            />
            <Text
              style={[
                styles.badgeText,
                badge.variant === 'warning' && styles.badgeTextWarning,
                badge.variant === 'success' && styles.badgeTextSuccess,
                badge.variant === 'info' && styles.badgeTextInfo,
              ]}
            >
              {badge.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  instructionContainer: {
    position: 'absolute',
    top: 100,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  instructionText: {
    ...Typography.bodyMedium,
    color: '#FFF',
    textAlign: 'center',
    fontWeight: '500',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: 'transparent',
  },
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    gap: Spacing.sm,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepDotActive: {
    backgroundColor: Colors.secondary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: Spacing.sm,
  },
  scanFrame: {
    // Width and Height are dynamic now
    borderRadius: Radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: Colors.secondary,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: Radius.xl,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: Radius.xl,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: Radius.xl,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: Radius.xl,
  },
  resizeHandle: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 44,
    height: 44,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 20,
  },
  scanningText: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  badgesContainer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  badgeInfo: {
    backgroundColor: Colors.primaryContainer,
  },
  badgeSuccess: {
    backgroundColor: Colors.secondaryContainer,
  },
  badgeWarning: {
    backgroundColor: Colors.errorContainer,
  },
  badgeIcon: {
    marginRight: Spacing.xs,
  },
  badgeText: {
    ...Typography.labelSmall,
    letterSpacing: 0.5,
  },
  badgeTextInfo: {
    color: Colors.onPrimary,
  },
  badgeTextSuccess: {
    color: Colors.onSecondaryContainer,
  },
  badgeTextWarning: {
    color: Colors.onErrorContainer,
  },
});

export default ScannerOverlay;
