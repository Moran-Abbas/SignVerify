import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { MaterialIcons } from '@expo/vector-icons';

interface Corner {
  x: number;
  y: number;
}

interface ARProjectionOverlayProps {
  corners: Corner[];
  frameWidth: number;
  frameHeight: number;
  metadata: {
    signer_name: string;
    signer_phone: string;
    participants: string[];
    all_signer_names?: string[];
    timestamp: string;
    reference_id: string;
  };
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * ARProjectionOverlay
 * Renders a perspective-mapped "Verified" card over a document.
 */
export const ARProjectionOverlay: React.FC<ARProjectionOverlayProps> = ({
  corners,
  frameWidth,
  frameHeight,
  metadata
}) => {
  // 1. Map corners to screen space
  const screenCorners = useMemo(() => {
    // In T5, we use full-frame verification. 
    // The 'frameWidth' and 'frameHeight' now represent the dimensions of the 
    // canonical analyze-frame (e.g. 1024 pixels width).
    const scaleX = screenWidth / frameWidth;
    const scaleY = screenHeight / frameHeight;
    
    return corners.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }));
  }, [corners, frameWidth, frameHeight, screenWidth, screenHeight]);

  // 3. Convert corners to SVG polygon string
  const pointsString = useMemo(() => {
    return screenCorners.map(p => `${p.x},${p.y}`).join(' ');
  }, [screenCorners]);

  // 4. Calculate center for Card placement
  const center = useMemo(() => {
    const sumX = screenCorners.reduce((acc, p) => acc + p.x, 0);
    const sumY = screenCorners.reduce((acc, p) => acc + p.y, 0);
    return { x: sumX / 4, y: sumY / 4 };
  }, [screenCorners]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Polygon
          points={pointsString}
          fill="rgba(52, 199, 89, 0.15)"
          stroke="#34C759"
          strokeWidth="3"
        />
      </Svg>

      {/* AR Evidence Card (Anchored to Center) */}
      <View style={[
        styles.arCard,
        { 
          left: center.x - 140, 
          top: center.y - 40 
        }
      ]}>
        <View style={[styles.arSeal, { backgroundColor: '#34C759' }]}>
          <MaterialIcons name="verified" size={24} color="#FFF" />
        </View>
        <View style={styles.arDetails}>
          <Text style={styles.arTitle}>VERIFIED LEDGER ENTRY</Text>
          <Text style={styles.arSigner} numberOfLines={1}>{metadata.signer_name}</Text>
          <Text style={styles.arRef} numberOfLines={1}>{metadata.signer_phone}</Text>
          <Text style={styles.arParticipants} numberOfLines={1}>
            {(metadata.all_signer_names?.length ? metadata.all_signer_names : metadata.participants)?.length
              ? (metadata.all_signer_names?.length ? metadata.all_signer_names : metadata.participants).join(', ')
              : 'No participant names on record'}
          </Text>
          <Text style={styles.arRef}>{metadata.reference_id} • Immutable Seal</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  arCard: {
    position: 'absolute',
    width: 280,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
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
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 2,
  },
  arSigner: {
    ...Typography.titleSmall,
    color: '#FFF',
    fontSize: 14,
  },
  arRef: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  arParticipants: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
  },
});
